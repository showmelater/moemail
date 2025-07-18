import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { activationCodes } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

// 卡密状态更新请求验证 schema
const updateStatusSchema = z.object({
  status: z.enum(['unused', 'used', 'expired', 'disabled'], {
    errorMap: () => ({ message: "状态必须是 unused, used, expired, disabled 之一" })
  })
})

type UpdateStatusRequest = z.infer<typeof updateStatusSchema>

// PUT - 更新卡密状态
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const json = await request.json() as UpdateStatusRequest
    
    // 验证请求参数
    try {
      updateStatusSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { status } = json
    const db = createDb()

    // 查找卡密
    const existingCode = await db.query.activationCodes.findFirst({
      where: eq(activationCodes.id, id)
    })

    if (!existingCode) {
      return NextResponse.json(
        { error: "卡密不存在" },
        { status: 404 }
      )
    }

    // 业务规则检查
    if (existingCode.status === 'used' && status !== 'disabled') {
      return NextResponse.json(
        { error: "已使用的卡密只能设置为禁用状态" },
        { status: 400 }
      )
    }

    // 如果是设置为已使用状态，需要额外验证
    if (status === 'used' && !existingCode.usedByUserId) {
      return NextResponse.json(
        { error: "无法将未绑定用户的卡密设置为已使用状态" },
        { status: 400 }
      )
    }

    // 更新卡密状态
    const updateData: any = { status }
    
    // 如果设置为过期状态，记录时间
    if (status === 'expired' && existingCode.status !== 'expired') {
      updateData.usedAt = new Date()
    }

    const [updatedCode] = await db.update(activationCodes)
      .set(updateData)
      .where(eq(activationCodes.id, id))
      .returning()

    return NextResponse.json({
      success: true,
      message: "卡密状态更新成功",
      activationCode: {
        id: updatedCode.id,
        code: updatedCode.code,
        status: updatedCode.status,
        createdAt: updatedCode.createdAt.getTime(),
        expiresAt: updatedCode.expiresAt?.getTime() || null,
        usedAt: updatedCode.usedAt?.getTime() || null
      }
    })

  } catch (error) {
    console.error('Failed to update activation code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新卡密状态失败" },
      { status: 500 }
    )
  }
}

// DELETE - 删除卡密
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const db = createDb()

    // 查找卡密
    const existingCode = await db.query.activationCodes.findFirst({
      where: eq(activationCodes.id, id)
    })

    if (!existingCode) {
      return NextResponse.json(
        { error: "卡密不存在" },
        { status: 404 }
      )
    }

    // 业务规则检查：已使用的卡密不能删除
    if (existingCode.status === 'used') {
      return NextResponse.json(
        { error: "已使用的卡密不能删除" },
        { status: 400 }
      )
    }

    // 删除卡密
    await db.delete(activationCodes)
      .where(eq(activationCodes.id, id))

    return NextResponse.json({
      success: true,
      message: "卡密删除成功"
    })

  } catch (error) {
    console.error('Failed to delete activation code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除卡密失败" },
      { status: 500 }
    )
  }
}

// GET - 获取单个卡密详情
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权限检查
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const db = createDb()

    // 查找卡密，包含使用者信息
    const code = await db.query.activationCodes.findFirst({
      where: eq(activationCodes.id, id),
      with: {
        usedByUser: {
          columns: {
            id: true,
            username: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!code) {
      return NextResponse.json(
        { error: "卡密不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      activationCode: {
        id: code.id,
        code: code.code,
        status: code.status,
        createdAt: code.createdAt.getTime(),
        expiresAt: code.expiresAt?.getTime() || null,
        usedAt: code.usedAt?.getTime() || null,
        usedByUser: code.usedByUser ? {
          id: code.usedByUser.id,
          username: code.usedByUser.username,
          name: code.usedByUser.name,
          email: code.usedByUser.email
        } : null
      }
    })

  } catch (error) {
    console.error('Failed to fetch activation code:', error)
    return NextResponse.json(
      { error: "获取卡密详情失败" },
      { status: 500 }
    )
  }
}
