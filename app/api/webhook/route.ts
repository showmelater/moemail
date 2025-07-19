import { auth, checkPermission } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { webhooks } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

const webhookSchema = z.object({
  url: z.string().url(),
  enabled: z.boolean()
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "未授权" }, { status: 401 })
  }

  // 权限检查：必须拥有 MANAGE_WEBHOOK 权限
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_WEBHOOK)
  if (!hasPermission) {
    return Response.json(
      { error: "权限不足，您没有管理 Webhook 的权限" },
      { status: 403 }
    )
  }

  const db = createDb()
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.userId, session.user.id)
  })

  return Response.json(webhook || { enabled: false, url: "" })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "未授权" }, { status: 401 })
  }

  // 权限检查：必须拥有 MANAGE_WEBHOOK 权限
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_WEBHOOK)
  if (!hasPermission) {
    return Response.json(
      { error: "权限不足，您没有管理 Webhook 的权限" },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { url, enabled } = webhookSchema.parse(body)
    
    const db = createDb()
    const now = new Date()

    const existingWebhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.userId, session.user.id)
    })

    if (existingWebhook) {
      await db
        .update(webhooks)
        .set({
          url,
          enabled,
          updatedAt: now
        })
        .where(eq(webhooks.userId, session.user.id))
    } else {
      await db
        .insert(webhooks)
        .values({
          userId: session.user.id,
          url,
          enabled,
        })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to save webhook:", error)
    return Response.json(
      { error: "Invalid request" },
      { status: 400 }
    )
  }
} 