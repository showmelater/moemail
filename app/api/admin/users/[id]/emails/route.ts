import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users, emails } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { generateRandomEmail } from "@/lib/utils"

export const runtime = "edge"

// 为用户添加邮箱请求验证 schema
const addEmailForUserSchema = z.object({
  isPermanent: z.boolean().optional().default(false),
  customAddress: z.string().optional(),
  expiryHours: z.number().min(1).max(8760).optional().default(24) // 1小时到1年
})

type AddEmailForUserRequest = z.infer<typeof addEmailForUserSchema>

// POST - 皇帝为用户添加邮箱
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以为用户添加邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: userId } = await params
    const json = await request.json() as AddEmailForUserRequest
    
    // 验证请求参数
    try {
      addEmailForUserSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { isPermanent, customAddress, expiryHours } = json
    const db = createDb()

    // 验证目标用户是否存在
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        userRoles: {
          with: {
            role: true
          }
        },
        emails: true
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    // 检查用户账号是否被禁用
    if (!targetUser.enabled) {
      return NextResponse.json(
        { error: "用户账号已被禁用，无法添加邮箱" },
        { status: 400 }
      )
    }

    // 如果是永久邮箱，检查是否已有永久邮箱
    if (isPermanent) {
      const existingPermanentEmail = targetUser.emails.find(email => email.isPermanent)
      if (existingPermanentEmail) {
        return NextResponse.json(
          { error: "该用户已有永久邮箱，每个用户只能有一个永久邮箱" },
          { status: 400 }
        )
      }
    }

    // 获取邮箱域名配置
    const env = getRequestContext().env
    const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
    const domains = domainString ? domainString.split(',') : ["moemail.app"]
    const domain = domains[0]

    // 生成邮箱地址
    let emailAddress: string
    if (customAddress) {
      // 验证自定义前缀的合法性（只允许字母、数字、下划线、连字符）
      const prefixRegex = /^[a-zA-Z0-9_-]+$/
      if (!prefixRegex.test(customAddress)) {
        return NextResponse.json(
          { error: "邮箱前缀只能包含字母、数字、下划线和连字符" },
          { status: 400 }
        )
      }

      // 检查前缀长度
      if (customAddress.length < 2 || customAddress.length > 30) {
        return NextResponse.json(
          { error: "邮箱前缀长度必须在2-30个字符之间" },
          { status: 400 }
        )
      }

      // 使用自定义地址
      emailAddress = `${customAddress.toLowerCase()}@${domain}`

      // 检查地址是否已被使用
      const existingEmail = await db.query.emails.findFirst({
        where: eq(emails.address, emailAddress)
      })

      if (existingEmail) {
        return NextResponse.json(
          { error: "该邮箱地址已被使用" },
          { status: 400 }
        )
      }
    } else {
      // 生成随机地址
      emailAddress = await generateRandomEmail(domain)
    }

    // 计算过期时间
    const now = new Date()
    const expiresAt = isPermanent 
      ? new Date('9999-01-01T00:00:00.000Z') // 永久邮箱
      : new Date(now.getTime() + expiryHours * 60 * 60 * 1000) // 临时邮箱

    // 创建邮箱
    const [newEmail] = await db.insert(emails)
      .values({
        address: emailAddress.toLowerCase(),
        userId: userId,
        createdAt: now,
        expiresAt,
        isPermanent: isPermanent || false
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: `成功为用户 ${targetUser.username} 添加${isPermanent ? '永久' : '临时'}邮箱`,
      email: {
        id: newEmail.id,
        address: newEmail.address,
        isPermanent: newEmail.isPermanent,
        createdAt: newEmail.createdAt,
        expiresAt: newEmail.expiresAt
      }
    })

  } catch (error) {
    console.error('Failed to add email for user:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "为用户添加邮箱失败" },
      { status: 500 }
    )
  }
}

// GET - 获取用户的邮箱列表
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以查看用户邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: userId } = await params
    const db = createDb()

    // 查找目标用户及其邮箱
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        userRoles: {
          with: {
            role: true
          }
        },
        emails: {
          columns: {
            id: true,
            address: true,
            isPermanent: true,
            createdAt: true,
            expiresAt: true
          }
        }
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        enabled: targetUser.enabled,
        primaryRole: targetUser.userRoles[0]?.role.name || 'civilian'
      },
      emails: targetUser.emails.map(email => ({
        id: email.id,
        address: email.address,
        isPermanent: email.isPermanent,
        createdAt: email.createdAt,
        expiresAt: email.expiresAt,
        isExpired: email.expiresAt < new Date()
      })),
      total: targetUser.emails.length,
      permanentCount: targetUser.emails.filter(e => e.isPermanent).length,
      activeCount: targetUser.emails.filter(e => e.expiresAt > new Date()).length
    })

  } catch (error) {
    console.error('Failed to get user emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取用户邮箱失败" },
      { status: 500 }
    )
  }
}
