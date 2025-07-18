import { NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { activationCodes, users } from "@/lib/schema"
import { eq, and, or, like, desc, sql, lt } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { encodeCursor, decodeCursor } from "@/lib/cursor"

export const runtime = "edge"

const PAGE_SIZE = 20

// 卡密生成请求验证 schema
const generateCodesSchema = z.object({
  count: z.number()
    .min(1, "生成数量必须大于0")
    .max(100, "单次最多生成100个卡密"),
  expiryDays: z.number()
    .min(0, "过期天数不能为负数")
    .max(365, "过期天数不能超过365天")
    .optional(),
  note: z.string()
    .max(100, "备注不能超过100个字符")
    .optional()
})

type GenerateCodesRequest = z.infer<typeof generateCodesSchema>

// 生成安全的卡密
function generateActivationCode(): string {
  // 生成格式：XXXX-XXXX-XXXX 的卡密
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segments = []
  
  for (let i = 0; i < 3; i++) {
    let segment = ''
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    segments.push(segment)
  }
  
  return segments.join('-')
}

// 获取卡密统计信息
async function getActivationCodeStats(db: any) {
  const stats = await db
    .select({
      status: activationCodes.status,
      count: sql<number>`count(*)`
    })
    .from(activationCodes)
    .groupBy(activationCodes.status)

  const result = {
    unused: 0,
    used: 0,
    expired: 0,
    disabled: 0
  }

  stats.forEach((stat: any) => {
    if (stat.status in result) {
      result[stat.status as keyof typeof result] = Number(stat.count)
    }
  })

  return result
}

// GET - 查看卡密列表
export async function GET(request: Request) {
  // 权限检查
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const status = searchParams.get('status') // unused, used, expired, disabled
  const search = searchParams.get('search') // 搜索卡密码

  const db = createDb()

  try {
    // 构建查询条件
    const conditions = []
    
    if (status && ['unused', 'used', 'expired', 'disabled'].includes(status)) {
      conditions.push(eq(activationCodes.status, status))
    }
    
    if (search) {
      conditions.push(like(activationCodes.code, `%${search}%`))
    }

    const baseConditions = conditions.length > 0 ? and(...conditions) : undefined

    // 获取总数
    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(activationCodes)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    // 分页条件
    const queryConditions = baseConditions ? [baseConditions] : []
    
    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      queryConditions.push(
        or(
          lt(activationCodes.createdAt, new Date(timestamp)),
          and(
            eq(activationCodes.createdAt, new Date(timestamp)),
            lt(activationCodes.id, id)
          )
        )
      )
    }

    // 查询卡密列表，包含使用者信息
    const results = await db.query.activationCodes.findMany({
      where: queryConditions.length > 0 ? and(...queryConditions) : undefined,
      with: {
        usedByUser: {
          columns: {
            id: true,
            username: true,
            name: true
          }
        }
      },
      orderBy: [desc(activationCodes.createdAt), desc(activationCodes.id)],
      limit: PAGE_SIZE + 1
    })

    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          results[PAGE_SIZE - 1].createdAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const codeList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({
      activationCodes: codeList.map(code => ({
        id: code.id,
        code: code.code,
        status: code.status,
        createdAt: code.createdAt.getTime(),
        expiresAt: code.expiresAt?.getTime() || null,
        usedAt: code.usedAt?.getTime() || null,
        usedByUser: code.usedByUser ? {
          id: code.usedByUser.id,
          username: code.usedByUser.username,
          name: code.usedByUser.name
        } : null
      })),
      nextCursor,
      total: totalCount,
      stats: await getActivationCodeStats(db)
    })

  } catch (error) {
    console.error('Failed to fetch activation codes:', error)
    return NextResponse.json(
      { error: "获取卡密列表失败" },
      { status: 500 }
    )
  }
}

// POST - 生成卡密
export async function POST(request: Request) {
  // 权限检查
  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!hasPermission) {
    return NextResponse.json(
      { error: "权限不足" },
      { status: 403 }
    )
  }

  try {
    const json = await request.json() as GenerateCodesRequest
    
    // 验证请求参数
    try {
      generateCodesSchema.parse(json)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "参数格式不正确" },
        { status: 400 }
      )
    }

    const { count, expiryDays, note } = json
    const db = createDb()

    // 计算过期时间
    const now = new Date()
    const expiresAt = expiryDays && expiryDays > 0 
      ? new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
      : null // null 表示永不过期

    // 生成卡密
    const codes = []
    const generatedCodes = new Set<string>()
    
    for (let i = 0; i < count; i++) {
      let code: string
      let attempts = 0
      
      // 确保生成的卡密唯一
      do {
        code = generateActivationCode()
        attempts++
        if (attempts > 100) {
          throw new Error("生成唯一卡密失败，请稍后重试")
        }
      } while (generatedCodes.has(code))
      
      generatedCodes.add(code)
      codes.push({
        code,
        status: 'unused' as const,
        createdAt: now,
        expiresAt,
        usedAt: null,
        usedByUserId: null
      })
    }

    // 批量插入数据库
    const insertedCodes = await db.insert(activationCodes)
      .values(codes)
      .returning()

    return NextResponse.json({
      success: true,
      message: `成功生成 ${count} 个卡密`,
      codes: insertedCodes.map(code => ({
        id: code.id,
        code: code.code,
        status: code.status,
        createdAt: code.createdAt.getTime(),
        expiresAt: code.expiresAt?.getTime() || null
      }))
    })

  } catch (error) {
    console.error('Failed to generate activation codes:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成卡密失败" },
      { status: 500 }
    )
  }
}
