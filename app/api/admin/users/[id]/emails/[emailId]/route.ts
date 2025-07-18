import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { eq, and } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

// 修改邮箱请求验证 schema
const updateEmailSchema = z.object({
  isPermanent: z.boolean().optional(),
  expiryHours: z.number().min(1).max(8760).optional(),
  customAddress: z.string().optional()
})

type UpdateEmailRequest = z.infer<typeof updateEmailSchema>

// PUT - 修改用户邮箱
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  // 权限检查：只有皇帝可以修改用户邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: userId, emailId } = await params
    const json = await request.json() as UpdateEmailRequest
    
    // 验证请求参数
    try {
      updateEmailSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { isPermanent, expiryHours, customAddress } = json
    const db = createDb()

    // 验证邮箱是否存在且属于指定用户
    const targetEmail = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, emailId),
        eq(emails.userId, userId)
      ),
      with: {
        user: {
          with: {
            userRoles: {
              with: {
                role: true
              }
            }
          }
        }
      }
    })

    if (!targetEmail) {
      return NextResponse.json(
        { error: "邮箱不存在或不属于该用户" },
        { status: 404 }
      )
    }

    // 检查用户账号是否被禁用
    if (!targetEmail.user?.enabled) {
      return NextResponse.json(
        { error: "用户账号已被禁用，无法修改邮箱" },
        { status: 400 }
      )
    }

    // 准备更新数据
    const updateData: any = {}

    // 处理永久邮箱设置
    if (isPermanent !== undefined) {
      if (isPermanent && !targetEmail.isPermanent) {
        // 检查用户是否已有其他永久邮箱
        const existingPermanentEmail = await db.query.emails.findFirst({
          where: and(
            eq(emails.userId, userId),
            eq(emails.isPermanent, true)
          )
        })
        
        if (existingPermanentEmail && existingPermanentEmail.id !== emailId) {
          return NextResponse.json(
            { error: "该用户已有永久邮箱，每个用户只能有一个永久邮箱" },
            { status: 400 }
          )
        }
      }
      updateData.isPermanent = isPermanent
    }

    // 处理过期时间
    if (expiryHours !== undefined && !updateData.isPermanent) {
      const now = new Date()
      updateData.expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000)
    } else if (updateData.isPermanent) {
      updateData.expiresAt = new Date('9999-01-01T00:00:00.000Z')
    }

    // 处理自定义地址
    if (customAddress !== undefined) {
      const env = getRequestContext().env
      const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
      const domains = domainString ? domainString.split(',') : ["moemail.app"]
      const domain = domains[0]
      
      const newEmailAddress = `${customAddress}@${domain}`
      
      // 检查新地址是否已被使用（排除当前邮箱）
      const existingEmail = await db.query.emails.findFirst({
        where: and(
          eq(emails.address, newEmailAddress.toLowerCase()),
          // 排除当前邮箱
        )
      })
      
      if (existingEmail && existingEmail.id !== emailId) {
        return NextResponse.json(
          { error: "该邮箱地址已被使用" },
          { status: 400 }
        )
      }
      
      updateData.address = newEmailAddress.toLowerCase()
    }

    // 执行更新
    const [updatedEmail] = await db.update(emails)
      .set(updateData)
      .where(eq(emails.id, emailId))
      .returning()

    return NextResponse.json({
      success: true,
      message: "邮箱更新成功",
      email: {
        id: updatedEmail.id,
        address: updatedEmail.address,
        isPermanent: updatedEmail.isPermanent,
        createdAt: updatedEmail.createdAt,
        expiresAt: updatedEmail.expiresAt
      }
    })

  } catch (error) {
    console.error('Failed to update email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新邮箱失败" },
      { status: 500 }
    )
  }
}

// DELETE - 删除用户邮箱
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  // 权限检查：只有皇帝可以删除用户邮箱
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_STUDENTS)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id: userId, emailId } = await params
    const db = createDb()

    // 验证邮箱是否存在且属于指定用户
    const targetEmail = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, emailId),
        eq(emails.userId, userId)
      ),
      with: {
        user: true
      }
    })

    if (!targetEmail) {
      return NextResponse.json(
        { error: "邮箱不存在或不属于该用户" },
        { status: 404 }
      )
    }

    // 删除邮箱
    await db.delete(emails)
      .where(eq(emails.id, emailId))

    return NextResponse.json({
      success: true,
      message: `成功删除邮箱 ${targetEmail.address}`
    })

  } catch (error) {
    console.error('Failed to delete email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除邮箱失败" },
      { status: 500 }
    )
  }
}
