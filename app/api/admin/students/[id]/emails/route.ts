import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users, emails } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { generateRandomEmail } from "@/lib/utils"

export const runtime = "edge"

// 为学生添加邮箱请求验证 schema
const addEmailForStudentSchema = z.object({
  isPermanent: z.boolean().optional().default(false),
  customAddress: z.string().optional(),
  expiryHours: z.number().min(1).max(8760).optional().default(24) // 1小时到1年
})

type AddEmailForStudentRequest = z.infer<typeof addEmailForStudentSchema>

// POST - 皇帝为学生添加邮箱
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以为学生添加邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: studentId } = await params
    const json = await request.json() as AddEmailForStudentRequest
    
    // 验证请求参数
    try {
      addEmailForStudentSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { isPermanent, customAddress, expiryHours } = json
    const db = createDb()

    // 验证目标学生是否存在
    const targetStudent = await db.query.users.findFirst({
      where: eq(users.id, studentId),
      with: {
        userRoles: {
          with: {
            role: true
          }
        },
        emails: true
      }
    })

    if (!targetStudent) {
      return NextResponse.json(
        { error: "学生不存在" },
        { status: 404 }
      )
    }

    // 检查是否为学生角色
    const isStudent = targetStudent.userRoles.some(ur => ur.role.name === ROLES.STUDENT)
    if (!isStudent) {
      return NextResponse.json(
        { error: "目标用户不是学生" },
        { status: 400 }
      )
    }

    // 检查学生账号是否被禁用
    if (!targetStudent.enabled) {
      return NextResponse.json(
        { error: "学生账号已被禁用，无法添加邮箱" },
        { status: 400 }
      )
    }

    // 如果是永久邮箱，检查是否已有永久邮箱
    if (isPermanent) {
      const existingPermanentEmail = targetStudent.emails.find(email => email.isPermanent)
      if (existingPermanentEmail) {
        return NextResponse.json(
          { error: "该学生已有永久邮箱，每个学生只能有一个永久邮箱" },
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
      // 使用自定义地址
      emailAddress = `${customAddress}@${domain}`
      
      // 检查地址是否已被使用
      const existingEmail = await db.query.emails.findFirst({
        where: eq(emails.address, emailAddress.toLowerCase())
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
        userId: studentId,
        createdAt: now,
        expiresAt,
        isPermanent: isPermanent || false
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: `成功为学生 ${targetStudent.username} 添加${isPermanent ? '永久' : '临时'}邮箱`,
      email: {
        id: newEmail.id,
        address: newEmail.address,
        isPermanent: newEmail.isPermanent,
        createdAt: newEmail.createdAt,
        expiresAt: newEmail.expiresAt
      }
    })

  } catch (error) {
    console.error('Failed to add email for student:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "为学生添加邮箱失败" },
      { status: 500 }
    )
  }
}

// GET - 获取学生的邮箱列表
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以查看学生邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: studentId } = await params
    const db = createDb()

    // 验证目标学生是否存在
    const targetStudent = await db.query.users.findFirst({
      where: eq(users.id, studentId),
      with: {
        userRoles: {
          with: {
            role: true
          }
        },
        emails: {
          orderBy: (emails, { desc }) => [desc(emails.createdAt)]
        }
      }
    })

    if (!targetStudent) {
      return NextResponse.json(
        { error: "学生不存在" },
        { status: 404 }
      )
    }

    // 检查是否为学生角色
    const isStudent = targetStudent.userRoles.some(ur => ur.role.name === ROLES.STUDENT)
    if (!isStudent) {
      return NextResponse.json(
        { error: "目标用户不是学生" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      student: {
        id: targetStudent.id,
        username: targetStudent.username,
        enabled: targetStudent.enabled
      },
      emails: targetStudent.emails.map(email => ({
        id: email.id,
        address: email.address,
        isPermanent: email.isPermanent,
        createdAt: email.createdAt,
        expiresAt: email.expiresAt,
        isExpired: email.expiresAt < new Date()
      })),
      total: targetStudent.emails.length,
      permanentCount: targetStudent.emails.filter(e => e.isPermanent).length
    })

  } catch (error) {
    console.error('Failed to get student emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取学生邮箱失败" },
      { status: 500 }
    )
  }
}
