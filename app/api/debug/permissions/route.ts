import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { userRoles } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { PERMISSIONS, hasPermission, Role } from "@/lib/permissions"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

export async function GET() {
  try {
    const session = await auth()
    const userId = await getUserId()
    
    if (!session?.user || !userId) {
      return NextResponse.json({
        error: "未授权",
        session: !!session,
        userId: !!userId
      }, { status: 401 })
    }

    const db = createDb()
    
    // 获取用户角色
    const userRoleRecords = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
      with: { role: true },
    })

    const userRoleNames = userRoleRecords.map(ur => ur.role.name)
    
    // 检查各种权限
    const permissions = {
      MANAGE_EMAIL: hasPermission(userRoleNames as Role[], PERMISSIONS.MANAGE_EMAIL),
      MANAGE_WEBHOOK: hasPermission(userRoleNames as Role[], PERMISSIONS.MANAGE_WEBHOOK),
      CREATE_EMAIL: hasPermission(userRoleNames as Role[], PERMISSIONS.CREATE_EMAIL),
      SET_PERMANENT_EMAIL: hasPermission(userRoleNames as Role[], PERMISSIONS.SET_PERMANENT_EMAIL),
      MANAGE_STUDENTS: hasPermission(userRoleNames as Role[], PERMISSIONS.MANAGE_STUDENTS),
    }

    return NextResponse.json({
      userId,
      sessionUser: {
        id: session.user.id,
        username: session.user.username,
        roles: session.user.roles
      },
      userRoles: userRoleRecords.map(ur => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description
      })),
      userRoleNames,
      permissions,
      debug: {
        hasManageEmailPermission: permissions.MANAGE_EMAIL,
        shouldAccessMoePage: permissions.MANAGE_EMAIL
      }
    })

  } catch (error) {
    console.error('Debug permissions error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "调试失败",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
