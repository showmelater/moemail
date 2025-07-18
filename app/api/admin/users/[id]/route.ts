import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users, emails, apiKeys, activationCodes, userRoles } from "@/lib/schema"
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

// DELETE - 删除用户及其相关数据
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以删除用户
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

    // 查找目标用户
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userRoles: {
          with: {
            role: true
          }
        },
        emails: true,
        apiKeys: true,
        activationCodes: true
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    // 防止删除皇帝账号
    const isEmperor = targetUser.userRoles.some(ur => ur.role.name === 'emperor')
    if (isEmperor) {
      return NextResponse.json(
        { error: "不能删除皇帝账号" },
        { status: 400 }
      )
    }

    // 开始事务删除用户及其相关数据
    await db.transaction(async (tx) => {
      // 1. 首先处理激活码 - 将 usedByUserId 设为 null（因为外键约束是 set null）
      if (targetUser.activationCodes.length > 0) {
        await tx.update(activationCodes)
          .set({ usedByUserId: null })
          .where(eq(activationCodes.usedByUserId, id))
      }

      // 2. 删除用户的邮箱（会级联删除相关消息）
      if (targetUser.emails.length > 0) {
        await tx.delete(emails).where(eq(emails.userId, id))
      }

      // 3. 删除用户的API密钥
      if (targetUser.apiKeys.length > 0) {
        await tx.delete(apiKeys).where(eq(apiKeys.userId, id))
      }

      // 4. 删除用户角色关联
      if (targetUser.userRoles.length > 0) {
        await tx.delete(userRoles).where(eq(userRoles.userId, id))
      }

      // 5. 最后删除用户本身
      await tx.delete(users).where(eq(users.id, id))
    })

    return NextResponse.json({
      success: true,
      message: `用户 ${targetUser.username} 及其相关数据已成功删除`,
      deletedData: {
        emails: targetUser.emails.length,
        apiKeys: targetUser.apiKeys.length,
        activationCodes: targetUser.activationCodes.length,
        userRoles: targetUser.userRoles.length
      }
    })

  } catch (error) {
    console.error('Failed to delete user:', error)

    // 提供更详细的错误信息
    let errorMessage = "删除用户失败"
    if (error instanceof Error) {
      errorMessage = error.message

      // 检查常见的数据库错误
      if (error.message.includes('FOREIGN KEY constraint failed')) {
        errorMessage = "删除失败：用户数据存在关联约束，请先清理相关数据"
      } else if (error.message.includes('database is locked')) {
        errorMessage = "删除失败：数据库正忙，请稍后重试"
      } else if (error.message.includes('no such table')) {
        errorMessage = "删除失败：数据库结构异常"
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 }
    )
  }
}
