import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users, emails, activationCodes, roles } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { assignRoleToUser } from "@/lib/auth"
import { hashPassword } from "@/lib/utils"
import { ROLES, Role } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import type { Db } from "@/lib/db"

export const runtime = "edge"

// 角色描述映射
const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [ROLES.EMPEROR]: "皇帝（网站所有者）",
  [ROLES.DUKE]: "公爵（超级用户）",
  [ROLES.KNIGHT]: "骑士（高级用户）",
  [ROLES.STUDENT]: "学生（卡密激活用户）",
  [ROLES.CIVILIAN]: "平民（普通用户）",
}

// 查找或创建角色
async function findOrCreateRole(db: Db, roleName: Role) {
  let role = await db.query.roles.findFirst({
    where: eq(roles.name, roleName),
  })

  if (!role) {
    const [newRole] = await db.insert(roles)
      .values({
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
      })
      .returning()
    role = newRole
  }

  return role
}

// 卡密激活请求验证 schema
const activateSchema = z.object({
  activationCode: z.string()
    .min(1, "卡密不能为空")
    .max(50, "卡密格式不正确"),
  username: z.string()
    .min(1, "用户名不能为空")
    .max(20, "用户名不能超过20个字符")
    .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和横杠")
    .refine(val => !val.includes('@'), "用户名不能是邮箱格式"),
  password: z.string()
    .min(8, "密码长度必须大于等于8位"),
  permanentEmail: z.string()
    .min(1, "永久邮箱地址不能为空")
    .max(50, "邮箱地址过长")
    .regex(/^[a-zA-Z0-9_-]+$/, "邮箱名只能包含字母、数字、下划线和横杠")
})

type ActivateRequest = z.infer<typeof activateSchema>

// 简单的内存频率限制（生产环境应使用 Redis 或 KV）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15分钟
const RATE_LIMIT_MAX_ATTEMPTS = 5 // 最多5次尝试

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false
  }

  record.count++
  return true
}

export async function POST(request: Request) {
  const db = createDb()

  try {
    // 频率限制检查
    const clientIP = request.headers.get('cf-connecting-ip') ||
                     request.headers.get('x-forwarded-for') ||
                     'unknown'

    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: "请求过于频繁，请15分钟后再试" },
        { status: 429 }
      )
    }

    // 解析和验证请求参数
    const json = await request.json() as ActivateRequest
    
    try {
      activateSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "输入格式不正确" },
        { status: 400 }
      )
    }

    const { activationCode, username, password, permanentEmail } = json

    // 开始事务处理
    return await db.transaction(async (tx) => {
      // 1. 验证卡密有效性
      const codeRecord = await tx.query.activationCodes.findFirst({
        where: eq(activationCodes.code, activationCode)
      })

      if (!codeRecord) {
        return NextResponse.json(
          { error: "卡密不存在" },
          { status: 400 }
        )
      }

      if (codeRecord.status !== 'unused') {
        return NextResponse.json(
          { error: "卡密已被使用或已失效" },
          { status: 400 }
        )
      }

      // 检查卡密是否过期
      if (codeRecord.expiresAt && new Date() > codeRecord.expiresAt) {
        // 更新卡密状态为过期
        await tx.update(activationCodes)
          .set({ status: 'expired' })
          .where(eq(activationCodes.id, codeRecord.id))
        
        return NextResponse.json(
          { error: "卡密已过期" },
          { status: 400 }
        )
      }

      // 2. 检查用户名是否已存在
      const existingUser = await tx.query.users.findFirst({
        where: eq(users.username, username)
      })

      if (existingUser) {
        return NextResponse.json(
          { error: "用户名已存在" },
          { status: 400 }
        )
      }

      // 3. 获取邮箱域名配置
      const env = getRequestContext().env
      const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
      const domains = domainString ? domainString.split(',') : ["moemail.app"]
      const domain = domains[0] // 使用第一个域名作为默认域名

      // 4. 检查永久邮箱地址是否已被使用
      const fullEmailAddress = `${permanentEmail}@${domain}`
      const existingEmail = await tx.query.emails.findFirst({
        where: eq(emails.address, fullEmailAddress.toLowerCase())
      })

      if (existingEmail) {
        return NextResponse.json(
          { error: "该邮箱地址已被使用" },
          { status: 400 }
        )
      }

      // 5. 创建用户账户
      const hashedPassword = await hashPassword(password)
      const [newUser] = await tx.insert(users)
        .values({
          username,
          password: hashedPassword,
        })
        .returning()

      // 6. 分配学生角色
      const studentRole = await findOrCreateRole(tx, ROLES.STUDENT)
      await assignRoleToUser(tx, newUser.id, studentRole.id)

      // 7. 创建永久邮箱
      const now = new Date()
      const permanentExpiry = new Date('9999-01-01T00:00:00.000Z') // 设置为永久
      
      const [newEmail] = await tx.insert(emails)
        .values({
          address: fullEmailAddress,
          userId: newUser.id,
          createdAt: now,
          expiresAt: permanentExpiry,
          isPermanent: true
        })
        .returning()

      // 8. 更新卡密状态为已使用
      await tx.update(activationCodes)
        .set({
          status: 'used',
          usedAt: now,
          usedByUserId: newUser.id
        })
        .where(eq(activationCodes.id, codeRecord.id))

      // 返回成功响应
      return NextResponse.json({
        success: true,
        message: "账户激活成功",
        user: {
          id: newUser.id,
          username: newUser.username
        },
        permanentEmail: {
          id: newEmail.id,
          address: newEmail.address
        }
      })
    })

  } catch (error) {
    console.error('Activation failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "激活失败" },
      { status: 500 }
    )
  }
}
