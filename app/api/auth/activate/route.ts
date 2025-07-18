import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users, emails, activationCodes, roles, userRoles } from "@/lib/schema"
import { eq } from "drizzle-orm"
// Role assignment is now handled inline
import { hashPassword } from "@/lib/utils"
import { ROLES, Role } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
export const runtime = "edge"

// 角色描述映射
const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [ROLES.EMPEROR]: "皇帝（网站所有者）",
  [ROLES.DUKE]: "公爵（超级用户）",
  [ROLES.KNIGHT]: "骑士（高级用户）",
  [ROLES.STUDENT]: "学生（卡密激活用户）",
  [ROLES.CIVILIAN]: "平民（普通用户）",
}

// 卡密激活请求验证 schema
const activateSchema = z.object({
  activationCode: z.string().min(1, "卡密不能为空"),
  username: z.string().min(1, "用户名不能为空"),
  password: z.string().min(8, "密码长度必须大于等于8位"),
  permanentEmail: z.string().min(1, "永久邮箱地址不能为空")
})



export async function POST(request: Request) {
  try {
    // 解析和验证请求参数
    const json = await request.json()
    const { activationCode, username, password, permanentEmail } = activateSchema.parse(json)

    const db = createDb()

    // 1. 验证卡密
    const codeRecord = await db.query.activationCodes.findFirst({
      where: eq(activationCodes.code, activationCode)
    })

    if (!codeRecord || codeRecord.status !== 'unused') {
      return NextResponse.json({ error: "卡密无效或已被使用" }, { status: 400 })
    }

    // 2. 检查用户名
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username)
    })

    if (existingUser) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 400 })
    }

    // 3. 创建用户
    const hashedPassword = await hashPassword(password)
    const [newUser] = await db.insert(users)
      .values({ username, password: hashedPassword })
      .returning()

    // 4. 处理学生角色
    let studentRole = await db.query.roles.findFirst({
      where: eq(roles.name, ROLES.STUDENT)
    })

    if (!studentRole) {
      const [newRole] = await db.insert(roles)
        .values({
          name: ROLES.STUDENT,
          description: ROLE_DESCRIPTIONS[ROLES.STUDENT]
        })
        .returning()
      studentRole = newRole
    }

    // 5. 分配角色
    await db.insert(userRoles)
      .values({
        userId: newUser.id,
        roleId: studentRole.id
      })

    // 6. 创建永久邮箱
    const env = getRequestContext().env
    const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
    const domains = domainString ? domainString.split(',') : ["moemail.app"]
    const fullEmailAddress = `${permanentEmail}@${domains[0]}`

    const [newEmail] = await db.insert(emails)
      .values({
        address: fullEmailAddress,
        userId: newUser.id,
        createdAt: new Date(),
        expiresAt: new Date('9999-01-01T00:00:00.000Z'),
        isPermanent: true
      })
      .returning()

    // 7. 更新卡密状态
    await db.update(activationCodes)
      .set({
        status: 'used',
        usedAt: new Date(),
        usedByUserId: newUser.id
      })
      .where(eq(activationCodes.id, codeRecord.id))

    return NextResponse.json({
      success: true,
      message: "账户激活成功",
      user: { id: newUser.id, username: newUser.username },
      permanentEmail: { id: newEmail.id, address: newEmail.address }
  } catch (error) {
    console.error('Activation failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "激活失败" },
      { status: 500 }
    )
  }
}
