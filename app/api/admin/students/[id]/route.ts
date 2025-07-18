import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"

export const runtime = "edge"

// 学生状态更新请求验证 schema
const updateStudentStatusSchema = z.object({
  enabled: z.boolean()
})

type UpdateStudentStatusRequest = z.infer<typeof updateStudentStatusSchema>

// PUT - 更新学生账号状态（启用/禁用）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以管理学生
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const json = await request.json() as UpdateStudentStatusRequest
    
    // 验证请求参数
    try {
      updateStudentStatusSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { enabled } = json
    const db = createDb()

    // 验证目标用户是否存在且为学生
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

    // 检查是否为学生角色
    const isStudent = targetUser.userRoles.some(ur => ur.role.name === ROLES.STUDENT)
    if (!isStudent) {
      return NextResponse.json(
        { error: "目标用户不是学生" },
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
      message: enabled ? "学生账号已启用" : "学生账号已禁用",
      student: {
        id: updatedUser.id,
        username: updatedUser.username,
        name: updatedUser.name,
        enabled: updatedUser.enabled
      }
    })

  } catch (error) {
    console.error('Failed to update student status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新学生状态失败" },
      { status: 500 }
    )
  }
}

// GET - 获取学生详细信息
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查：只有皇帝可以查看学生详情
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

    // 查找学生详细信息
    const student = await db.query.users.findFirst({
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

    if (!student) {
      return NextResponse.json(
        { error: "学生不存在" },
        { status: 404 }
      )
    }

    // 检查是否为学生角色
    const isStudent = student.userRoles.some(ur => ur.role.name === ROLES.STUDENT)
    if (!isStudent) {
      return NextResponse.json(
        { error: "目标用户不是学生" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      student: {
        id: student.id,
        username: student.username,
        name: student.name,
        enabled: student.enabled,
        emails: student.emails.map(email => ({
          id: email.id,
          address: email.address,
          isPermanent: email.isPermanent,
          createdAt: email.createdAt,
          expiresAt: email.expiresAt
        })),
        activationCode: student.activationCodes[0] || null,
        emailCount: student.emails.length,
        permanentEmailCount: student.emails.filter(e => e.isPermanent).length
      }
    })

  } catch (error) {
    console.error('Failed to get student details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取学生详情失败" },
      { status: 500 }
    )
  }
}
