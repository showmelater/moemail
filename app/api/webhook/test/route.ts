import { callWebhook } from "@/lib/webhook"
import { WEBHOOK_CONFIG } from "@/config"
import { z } from "zod"
import { EmailMessage } from "@/lib/webhook"
import { auth, checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

const testSchema = z.object({
  url: z.string().url()
})

export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const { url } = testSchema.parse(body)

    await callWebhook(url, {
      event: WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
      data: {
        emailId: "123456789",
        messageId: '987654321',
        fromAddress: "sender@example.com",
        subject: "Test Email",
        content: "This is a test email.",
        html: "<p>This is a <strong>test</strong> email.</p>",
        receivedAt: "2023-03-01T12:00:00Z",
        toAddress: "recipient@example.com"
      } as EmailMessage
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to test webhook:", error)
    return Response.json(
      { error: "Failed to test webhook" },
      { status: 400 }
    )
  }
} 