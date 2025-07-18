import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

// 用户状态更新请求验证 schema
const updateUserStatusSchema = z.object({
  enabled: z.boolean()
})

type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>

// PUT - 更新用户账号状态（启用/禁用）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以管理用户
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const json = await request.json() as UpdateUserStatusRequest
    
    // 验证请求参数
    try {
      updateUserStatusSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { enabled } = json
    const db = createDb()

    // 查找目标用户
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userRoles: {
          with: {
            role: true
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

    // 防止禁用皇帝账号
    const isEmperor = targetUser.userRoles.some(ur => ur.role.name === 'emperor')
    if (isEmperor && !enabled) {
      return NextResponse.json(
        { error: "不能禁用皇帝账号" },
        { status: 400 }
      )
    }

    // 更新用户状态
    const [updatedUser] = await db.update(users)
      .set({ enabled })
      .where(eq(users.id, id))
      .returning()

    return NextResponse.json({
      success: true,
      message: `用户 ${targetUser.username} 已${enabled ? '启用' : '禁用'}`,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        name: updatedUser.name,
        enabled: updatedUser.enabled
      }
    })

  } catch (error) {
    console.error('Failed to update user status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新用户状态失败" },
      { status: 500 }
    )
  }
}

// GET - 获取用户详细信息
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以查看用户详情
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const db = createDb()

    // 查找用户详细信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
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
        },
        activationCodes: {
          columns: {
            id: true,
            code: true,
            status: true,
            usedAt: true
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        enabled: user.enabled,
        roles: user.userRoles.map(ur => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description
        })),
        primaryRole: user.userRoles[0]?.role.name || 'civilian',
        emails: user.emails.map(email => ({
          id: email.id,
          address: email.address,
          isPermanent: email.isPermanent,
          createdAt: email.createdAt,
          expiresAt: email.expiresAt,
          isExpired: email.expiresAt < new Date()
        })),
        activationCode: user.activationCodes[0] || null,
        emailCount: user.emails.length,
        permanentEmailCount: user.emails.filter(e => e.isPermanent).length,
        activeEmailCount: user.emails.filter(e => e.expiresAt > new Date()).length
      }
    })

  } catch (error) {
    console.error('Failed to get user details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取用户详情失败" },
      { status: 500 }
    )
  }
}
