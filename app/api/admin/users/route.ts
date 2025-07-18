import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { desc } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"

export const runtime = "edge"

// GET - 获取用户列表（支持按角色筛选）
export async function GET(request: Request) {
  // 权限检查：只有皇帝可以管理用户
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || 'all' // all, enabled, disabled
  const role = searchParams.get('role') || 'all' // all, emperor, duke, knight, student, civilian
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const db = createDb()

  try {
    // 获取所有用户及其角色和邮箱信息
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
            expiresAt: true,
            createdAt: true
          }
        }
      },
      orderBy: [desc(users.id)]
    })

    // 过滤用户
    let filteredUsers = allUsers

    // 按角色过滤
    if (role !== 'all') {
      filteredUsers = filteredUsers.filter(user =>
        user.userRoles.some(ur => ur.role.name === role)
      )
    }

    // 按搜索条件过滤
    if (search) {
      filteredUsers = filteredUsers.filter(user =>
        user.username?.toLowerCase().includes(search.toLowerCase()) ||
        user.name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email?.toLowerCase().includes(search.toLowerCase()) ||
        false
      )
    }

    // 按状态过滤
    if (status !== 'all') {
      const enabled = status === 'enabled'
      filteredUsers = filteredUsers.filter(user => user.enabled === enabled)
    }

    // 分页
    const total = filteredUsers.length
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex)

    return NextResponse.json({
      users: paginatedUsers.map(user => ({
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
        primaryRole: user.userRoles[0]?.role.name || ROLES.CIVILIAN,
        emails: user.emails.map(email => ({
          id: email.id,
          address: email.address,
          isPermanent: email.isPermanent,
          expiresAt: email.expiresAt,
          createdAt: email.createdAt,
          isExpired: email.expiresAt < new Date()
        })),
        emailCount: user.emails.length,
        permanentEmailCount: user.emails.filter(e => e.isPermanent).length,
        activeEmailCount: user.emails.filter(e => e.expiresAt > new Date()).length
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: endIndex < total,
        hasPrev: page > 1
      },
      summary: {
        totalUsers: total,
        enabledUsers: filteredUsers.filter(u => u.enabled).length,
        disabledUsers: filteredUsers.filter(u => !u.enabled).length,
        roleDistribution: {
          emperor: filteredUsers.filter(u => u.userRoles.some(ur => ur.role.name === ROLES.EMPEROR)).length,
          duke: filteredUsers.filter(u => u.userRoles.some(ur => ur.role.name === ROLES.DUKE)).length,
          knight: filteredUsers.filter(u => u.userRoles.some(ur => ur.role.name === ROLES.KNIGHT)).length,
          student: filteredUsers.filter(u => u.userRoles.some(ur => ur.role.name === ROLES.STUDENT)).length,
          civilian: filteredUsers.filter(u => u.userRoles.some(ur => ur.role.name === ROLES.CIVILIAN)).length
        }
      }
    })

  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json(
      { error: "获取用户列表失败" },
      { status: 500 }
    )
  }
}
