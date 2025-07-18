import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { desc } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"

export const runtime = "edge"

// GET - 获取学生列表
export async function GET(request: Request) {
  // 权限检查：只有皇帝可以管理学生
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || 'all'

  const db = createDb()

  try {
    // 简化查询：先获取所有用户，然后过滤学生
    const allUsers = await db.query.users.findMany({
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
            expiresAt: true
          }
        }
      },
      orderBy: [desc(users.id)]
    })

    // 过滤学生用户
    let studentUsers = allUsers.filter(user =>
      user.userRoles.some(ur => ur.role.name === ROLES.STUDENT)
    )

    // 应用搜索过滤
    if (search) {
      studentUsers = studentUsers.filter(user =>
        user.username?.toLowerCase().includes(search.toLowerCase()) || false
      )
    }

    // 应用状态过滤
    if (status !== 'all') {
      const enabled = status === 'enabled'
      studentUsers = studentUsers.filter(user => user.enabled === enabled)
    }

    return NextResponse.json({
      students: studentUsers.map(student => ({
        id: student.id,
        username: student.username,
        name: student.name,
        enabled: student.enabled,
        emails: student.emails.map(email => ({
          id: email.id,
          address: email.address,
          isPermanent: email.isPermanent,
          expiresAt: email.expiresAt
        })),
        emailCount: student.emails.length,
        permanentEmailCount: student.emails.filter(e => e.isPermanent).length
      })),
      total: studentUsers.length
    })

  } catch (error) {
    console.error('Failed to fetch students:', error)
    return NextResponse.json(
      { error: "获取学生列表失败" },
      { status: 500 }
    )
  }
}
