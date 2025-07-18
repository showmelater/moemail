import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { eq, and, gt } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

// GET - 获取可以设置为永久邮箱的邮箱列表
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

    // 检查用户是否已有永久邮箱
    const existingPermanentEmail = await db.query.emails.findFirst({
      where: and(
        eq(emails.userId, userId),
        eq(emails.isPermanent, true)
      )
    })

    if (existingPermanentEmail) {
      return NextResponse.json({
        canSetPermanent: false,
        message: "您已经设置了永久邮箱",
        permanentEmail: {
          id: existingPermanentEmail.id,
          address: existingPermanentEmail.address,
          createdAt: existingPermanentEmail.createdAt.getTime()
        },
        availableEmails: []
      })
    }

    // 获取用户的有效邮箱列表（未过期且非永久的）
    const availableEmails = await db.query.emails.findMany({
      where: and(
        eq(emails.userId, userId),
        gt(emails.expiresAt, new Date()),
        eq(emails.isPermanent, false)
      ),
      orderBy: (emails, { desc }) => [desc(emails.createdAt)]
    })

    return NextResponse.json({
      canSetPermanent: true,
      message: availableEmails.length > 0 
        ? "您可以选择一个邮箱设置为永久邮箱" 
        : "您暂时没有可设置为永久邮箱的邮箱",
      permanentEmail: null,
      availableEmails: availableEmails.map(email => ({
        id: email.id,
        address: email.address,
        createdAt: email.createdAt.getTime(),
        expiresAt: email.expiresAt.getTime()
      }))
    })

  } catch (error) {
    console.error('Failed to get available emails for permanent:', error)
    return NextResponse.json(
      { error: "获取可用邮箱列表失败" },
      { status: 500 }
    )
  }
}
