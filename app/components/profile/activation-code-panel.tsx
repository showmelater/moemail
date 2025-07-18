"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Ticket, Plus, Search, Filter, Loader2, Eye, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { useState, useEffect } from "react"
import { useToast } from "@/components/ui/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface ActivationCode {
  id: string
  code: string
  status: 'unused' | 'used' | 'expired' | 'disabled'
  createdAt: number
  expiresAt: number | null
  usedAt: number | null
  usedByUser: {
    id: string
    username: string
    name: string
  } | null
}

interface ActivationCodeStats {
  unused: number
  used: number
  expired: number
  disabled: number
}

interface ActivationCodeResponse {
  activationCodes: ActivationCode[]
  nextCursor: string | null
  total: number
  stats: ActivationCodeStats
}

const statusConfig = {
  unused: { label: "未使用", color: "bg-green-100 text-green-800" },
  used: { label: "已使用", color: "bg-blue-100 text-blue-800" },
  expired: { label: "已过期", color: "bg-yellow-100 text-yellow-800" },
  disabled: { label: "已禁用", color: "bg-red-100 text-red-800" },
} as const

export function ActivationCodePanel() {
  const [codes, setCodes] = useState<ActivationCode[]>([])
  const [stats, setStats] = useState<ActivationCodeStats>({ unused: 0, used: 0, expired: 0, disabled: 0 })
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [generateCount, setGenerateCount] = useState("1")
  const [generateExpiry, setGenerateExpiry] = useState("0")
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchCodes()
  }, [searchText, statusFilter])

  const fetchCodes = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchText) params.append('search', searchText)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`/api/admin/activation-codes?${params}`)
      if (!response.ok) throw new Error('获取卡密列表失败')

      const data: ActivationCodeResponse = await response.json()
      setCodes(data.activationCodes)
      setStats(data.stats)
    } catch (error) {
      toast({
        title: "获取失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    const count = parseInt(generateCount)
    const expiryDays = parseInt(generateExpiry)
    
    if (count < 1 || count > 100) {
      toast({
        title: "参数错误",
        description: "生成数量必须在1-100之间",
        variant: "destructive"
      })
      return
    }

    setGenerating(true)
    try {
      const response = await fetch('/api/admin/activation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          expiryDays: expiryDays > 0 ? expiryDays : undefined
        })
      })

      if (!response.ok) throw new Error('生成卡密失败')

      const data = await response.json()
      toast({
        title: "生成成功",
        description: `成功生成 ${count} 个卡密`,
      })
      
      setShowGenerateDialog(false)
      setGenerateCount("1")
      setGenerateExpiry("0")
      fetchCodes()
    } catch (error) {
      toast({
        title: "生成失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive"
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleStatusChange = async (codeId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/activation-codes/${codeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) throw new Error('更新状态失败')

      toast({
        title: "更新成功",
        description: "卡密状态已更新",
      })
      fetchCodes()
    } catch (error) {
      toast({
        title: "更新失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive"
      })
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  return (
    <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Ticket className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">卡密管理</h2>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-sm text-green-600">未使用</div>
          <div className="text-xl font-bold text-green-800">{stats.unused}</div>
        </div>
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-sm text-blue-600">已使用</div>
          <div className="text-xl font-bold text-blue-800">{stats.used}</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded-lg">
          <div className="text-sm text-yellow-600">已过期</div>
          <div className="text-xl font-bold text-yellow-800">{stats.expired}</div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg">
          <div className="text-sm text-red-600">已禁用</div>
          <div className="text-xl font-bold text-red-800">{stats.disabled}</div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索卡密..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="unused">未使用</SelectItem>
              <SelectItem value="used">已使用</SelectItem>
              <SelectItem value="expired">已过期</SelectItem>
              <SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              生成卡密
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>生成卡密</DialogTitle>
              <DialogDescription>
                批量生成激活卡密，可设置过期时间
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="count">生成数量</Label>
                <Input
                  id="count"
                  type="number"
                  min="1"
                  max="100"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(e.target.value)}
                  placeholder="1-100"
                />
              </div>
              <div>
                <Label htmlFor="expiry">过期天数</Label>
                <Input
                  id="expiry"
                  type="number"
                  min="0"
                  max="365"
                  value={generateExpiry}
                  onChange={(e) => setGenerateExpiry(e.target.value)}
                  placeholder="0表示永不过期"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full"
              >
                {generating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                生成卡密
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 卡密列表 */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无卡密数据
          </div>
        ) : (
          codes.map((code) => (
            <div key={code.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-mono text-lg font-semibold">{code.code}</div>
                <Badge className={statusConfig[code.status].color}>
                  {statusConfig[code.status].label}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-1">
                <div>创建时间：{formatDate(code.createdAt)}</div>
                {code.expiresAt && (
                  <div>过期时间：{formatDate(code.expiresAt)}</div>
                )}
                {code.usedAt && (
                  <div>使用时间：{formatDate(code.usedAt)}</div>
                )}
                {code.usedByUser && (
                  <div>使用者：{code.usedByUser.username}</div>
                )}
              </div>

              {code.status !== 'used' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(code.id, code.status === 'disabled' ? 'unused' : 'disabled')}
                  >
                    {code.status === 'disabled' ? (
                      <>
                        <ToggleRight className="w-4 h-4 mr-1" />
                        启用
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 mr-1" />
                        禁用
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
