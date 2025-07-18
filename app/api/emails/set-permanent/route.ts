import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { eq, and } from "drizzle-orm"
import { checkPermission, getUserRole } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

// 永久邮箱设置请求验证 schema
const setPermanentEmailSchema = z.object({
  emailId: z.string()
    .min(1, "邮箱ID不能为空")
    .uuid("邮箱ID格式不正确")
})

type SetPermanentEmailRequest = z.infer<typeof setPermanentEmailSchema>

export async function POST(request: Request) {
  try {
    // 获取用户ID
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      )
    }

    // 权限检查：必须是学生角色且拥有 SET_PERMANENT_EMAIL 权限
    const hasPermission = await checkPermission(PERMISSIONS.SET_PERMANENT_EMAIL)
    if (!hasPermission) {
      return NextResponse.json(
        { error: "权限不足，只有学生角色可以设置永久邮箱" },
        { status: 403 }
      )
    }

    // 验证用户角色（额外检查确保是学生）
    const userRole = await getUserRole(userId)
    if (userRole !== ROLES.STUDENT) {
      return NextResponse.json(
        { error: "只有学生角色可以设置永久邮箱" },
        { status: 403 }
      )
    }

    // 解析和验证请求参数
    const json = await request.json() as SetPermanentEmailRequest
    
    try {
      setPermanentEmailSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { emailId } = json
    const db = createDb()

    // 开始事务处理
    return await db.transaction(async (tx) => {
      // 1. 检查用户是否已有永久邮箱
      const existingPermanentEmail = await tx.query.emails.findFirst({
        where: and(
          eq(emails.userId, userId),
          eq(emails.isPermanent, true)
        )
      })

      if (existingPermanentEmail) {
        return NextResponse.json(
          { error: "您已经设置了永久邮箱，每个学生只能设置一个永久邮箱" },
          { status: 400 }
        )
      }

      // 2. 验证目标邮箱是否存在且属于当前用户
      const targetEmail = await tx.query.emails.findFirst({
        where: and(
          eq(emails.id, emailId),
          eq(emails.userId, userId)
        )
      })

      if (!targetEmail) {
        return NextResponse.json(
          { error: "邮箱不存在或无权访问" },
          { status: 404 }
        )
      }

      // 3. 检查邮箱是否已经是永久邮箱
      if (targetEmail.isPermanent) {
        return NextResponse.json(
          { error: "该邮箱已经是永久邮箱" },
          { status: 400 }
        )
      }

      // 4. 检查邮箱是否已过期
      if (new Date() > targetEmail.expiresAt) {
        return NextResponse.json(
          { error: "无法将已过期的邮箱设置为永久邮箱" },
          { status: 400 }
        )
      }

      // 5. 更新邮箱为永久邮箱
      const permanentExpiry = new Date('9999-01-01T00:00:00.000Z')
      
      const [updatedEmail] = await tx.update(emails)
        .set({
          isPermanent: true,
          expiresAt: permanentExpiry
        })
        .where(eq(emails.id, emailId))
        .returning()

      // 返回成功响应
      return NextResponse.json({
        success: true,
        message: "永久邮箱设置成功",
        email: {
          id: updatedEmail.id,
          address: updatedEmail.address,
          isPermanent: updatedEmail.isPermanent,
          createdAt: updatedEmail.createdAt.getTime(),
          expiresAt: updatedEmail.expiresAt.getTime()
        }
      })
    })

  } catch (error) {
    console.error('Failed to set permanent email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "设置永久邮箱失败" },
      { status: 500 }
    )
  }
}

// GET - 获取用户的永久邮箱信息
export async function GET() {
  try {
    // 获取用户ID
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      )
    }

    // 权限检查：必须是学生角色
    const hasPermission = await checkPermission(PERMISSIONS.SET_PERMANENT_EMAIL)
    if (!hasPermission) {
      return NextResponse.json(
        { error: "权限不足" },
        { status: 403 }
      )
    }

    const db = createDb()

    // 查找用户的永久邮箱
    const permanentEmail = await db.query.emails.findFirst({
      where: and(
        eq(emails.userId, userId),
        eq(emails.isPermanent, true)
      )
    })

    return NextResponse.json({
      hasPermanentEmail: !!permanentEmail,
      permanentEmail: permanentEmail ? {
        id: permanentEmail.id,
        address: permanentEmail.address,
        createdAt: permanentEmail.createdAt.getTime(),
        expiresAt: permanentEmail.expiresAt.getTime()
      } : null
    })

  } catch (error) {
    console.error('Failed to get permanent email info:', error)
    return NextResponse.json(
      { error: "获取永久邮箱信息失败" },
      { status: 500 }
    )
  }
}
