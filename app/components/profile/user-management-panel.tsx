"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Search, Loader2, UserCheck, UserX, Mail, Plus, Crown, Gem, Sword, GraduationCap, User2, Trash2 } from "lucide-react"
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
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"


interface User {
  id: string
  username: string
  name: string | null
  email: string | null
  enabled: boolean
  roles: Array<{
    id: string
    name: string
    description: string
  }>
  primaryRole: string
  emails: Array<{
    id: string
    address: string
    isPermanent: boolean
    expiresAt: number
    createdAt: number
    isExpired: boolean
  }>
  emailCount: number
  permanentEmailCount: number
  activeEmailCount: number
}

interface AddEmailForm {
  isPermanent: boolean
  customAddress: string
  expiryHours: number
}

interface UsersResponse {
  users: User[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  summary: {
    totalUsers: number
    enabledUsers: number
    disabledUsers: number
    roleDistribution: {
      emperor: number
      duke: number
      knight: number
      student: number
      civilian: number
    }
  }
}

interface UserStatusResponse {
  success: boolean
  message: string
  user: {
    id: string
    username: string
    name: string | null
    enabled: boolean
  }
}

interface AddEmailResponse {
  success: boolean
  message: string
  email: {
    id: string
    address: string
    isPermanent: boolean
    createdAt: string
    expiresAt: string
  }
}

const roleIcons = {
  emperor: Crown,
  duke: Gem,
  knight: Sword,
  student: GraduationCap,
  civilian: User2,
} as const

const roleNames = {
  emperor: '皇帝',
  duke: '公爵',
  knight: '骑士',
  student: '学生',
  civilian: '平民',
} as const

const roleColors = {
  emperor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  duke: 'bg-purple-100 text-purple-800 border-purple-200',
  knight: 'bg-blue-100 text-blue-800 border-blue-200',
  student: 'bg-green-100 text-green-800 border-green-200',
  civilian: 'bg-gray-100 text-gray-800 border-gray-200',
} as const

export function UserManagementPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [roleFilter, setRoleFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false)
  const [showUserEmailsDialog, setShowUserEmailsDialog] = useState(false)
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false)
  const [userEmails, setUserEmails] = useState<User['emails']>([])
  const [addEmailForm, setAddEmailForm] = useState<AddEmailForm>({
    isPermanent: false,
    customAddress: "",
    expiryHours: 24
  })
  const [actionLoading, setActionLoading] = useState(false)
  const [summary, setSummary] = useState<UsersResponse['summary'] | null>(null)
  const { toast } = useToast()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchText) params.append('search', searchText)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (roleFilter !== 'all') params.append('role', roleFilter)

      const response = await fetch(`/api/admin/users?${params}`)
      if (!response.ok) throw new Error("获取用户列表失败")
      
      const data = await response.json() as UsersResponse
      setUsers(data.users)
      setSummary(data.summary)
    } catch {
      toast({
        title: "获取失败",
        description: "获取用户列表失败",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [searchText, statusFilter, roleFilter, toast])

  useEffect(() => {
    fetchUsers()
  }, [searchText, statusFilter, roleFilter, fetchUsers])

  const handleToggleUserStatus = async (user: User) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !user.enabled })
      })

      if (!response.ok) throw new Error("更新用户状态失败")

      const data = await response.json() as UserStatusResponse
      toast({
        title: "操作成功",
        description: data.message
      })

      // 刷新列表
      fetchUsers()
    } catch (error) {
      toast({
        title: "操作失败",
        description: error instanceof Error ? error.message : "更新用户状态失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddEmailForUser = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addEmailForm)
      })

      if (!response.ok) throw new Error("为用户添加邮箱失败")

      const data = await response.json() as AddEmailResponse
      toast({
        title: "添加成功",
        description: data.message
      })

      // 重置表单并关闭对话框
      setAddEmailForm({
        isPermanent: false,
        customAddress: "",
        expiryHours: 24
      })
      setShowAddEmailDialog(false)
      setSelectedUser(null)

      // 刷新列表
      fetchUsers()
    } catch (error) {
      toast({
        title: "添加失败",
        description: error instanceof Error ? error.message : "为用户添加邮箱失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleViewUserEmails = async (user: User) => {
    setSelectedUser(user)
    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/emails`)
      if (!response.ok) throw new Error("获取用户邮箱失败")
      
      const data = await response.json() as { emails: User['emails'] }
      setUserEmails(data.emails)
      setShowUserEmailsDialog(true)
    } catch (error) {
      toast({
        title: "获取失败",
        description: error instanceof Error ? error.message : "获取用户邮箱失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteEmail = async (emailId: string) => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/emails/${emailId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error("删除邮箱失败")

      const data = await response.json() as { message: string }
      toast({
        title: "删除成功",
        description: data.message
      })

      // 刷新邮箱列表
      handleViewUserEmails(selectedUser)
      // 刷新用户列表
      fetchUsers()
    } catch (error) {
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "删除邮箱失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error("删除用户失败")

      const data = await response.json() as {
        success: boolean
        message: string
        deletedData: {
          emails: number
          apiKeys: number
          activationCodes: number
          userRoles: number
        }
      }

      toast({
        title: "删除成功",
        description: `${data.message}（删除了 ${data.deletedData.emails} 个邮箱、${data.deletedData.apiKeys} 个API密钥）`
      })

      // 关闭对话框并重置状态
      setShowDeleteUserDialog(false)
      setSelectedUser(null)

      // 刷新用户列表
      fetchUsers()
    } catch (error) {
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "删除用户失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          用户管理
        </CardTitle>
        <CardDescription>
          管理所有用户账号，支持按角色筛选，可以禁用账号或为用户管理邮箱
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 统计信息 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.totalUsers}</div>
              <div className="text-sm text-gray-600">总用户</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{summary.enabledUsers}</div>
              <div className="text-sm text-gray-600">已启用</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{summary.disabledUsers}</div>
              <div className="text-sm text-gray-600">已禁用</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{summary.roleDistribution.student}</div>
              <div className="text-sm text-gray-600">学生</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{summary.roleDistribution.civilian}</div>
              <div className="text-sm text-gray-600">平民</div>
            </div>
          </div>
        )}

        {/* 搜索和筛选 */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="搜索用户名、姓名或邮箱..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="enabled">已启用</SelectItem>
              <SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="emperor">皇帝</SelectItem>
              <SelectItem value="duke">公爵</SelectItem>
              <SelectItem value="knight">骑士</SelectItem>
              <SelectItem value="student">学生</SelectItem>
              <SelectItem value="civilian">平民</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 用户列表 */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
            <span className="ml-2 text-sm text-gray-500">加载用户列表...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>暂无用户数据</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => {
              const RoleIcon = roleIcons[user.primaryRole as keyof typeof roleIcons] || User2
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.username}</span>
                        {user.name && (
                          <span className="text-sm text-gray-500">({user.name})</span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs ${roleColors[user.primaryRole as keyof typeof roleColors]}`}
                        >
                          <RoleIcon className="w-3 h-3 mr-1" />
                          {roleNames[user.primaryRole as keyof typeof roleNames]}
                        </Badge>
                        {!user.enabled && (
                          <Badge variant="destructive" className="text-xs">
                            已禁用
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span>邮箱: {user.emailCount} 个</span>
                        <span>永久: {user.permanentEmailCount} 个</span>
                        <span>活跃: {user.activeEmailCount} 个</span>
                        {user.email && (
                          <span>登录邮箱: {user.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewUserEmails(user)}
                      disabled={actionLoading}
                      className="gap-1"
                    >
                      <Mail className="w-4 h-4" />
                      邮箱管理
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user)
                        setShowAddEmailDialog(true)
                      }}
                      disabled={actionLoading || !user.enabled}
                      className="gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      添加邮箱
                    </Button>
                    <Button
                      variant={user.enabled ? "destructive" : "default"}
                      size="sm"
                      onClick={() => handleToggleUserStatus(user)}
                      disabled={actionLoading || user.primaryRole === 'emperor'}
                      className="gap-1"
                    >
                      {user.enabled ? (
                        <>
                          <UserX className="w-4 h-4" />
                          禁用
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4" />
                          启用
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user)
                        setShowDeleteUserDialog(true)
                      }}
                      disabled={actionLoading || user.primaryRole === 'emperor'}
                      className="gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 添加邮箱对话框 */}
        <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>为用户添加邮箱</DialogTitle>
              <DialogDescription>
                为 {selectedUser?.username} 添加新的邮箱地址
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="permanent"
                  checked={addEmailForm.isPermanent}
                  onCheckedChange={(checked) =>
                    setAddEmailForm(prev => ({ ...prev, isPermanent: checked }))
                  }
                />
                <Label htmlFor="permanent">永久邮箱</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customAddress">自定义地址（可选）</Label>
                <Input
                  id="customAddress"
                  placeholder="留空自动生成随机地址（只能包含字母、数字、下划线、连字符）"
                  value={addEmailForm.customAddress}
                  onChange={(e) => {
                    // 只允许字母、数字、下划线、连字符
                    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '')
                    setAddEmailForm(prev => ({ ...prev, customAddress: value }))
                  }}
                  maxLength={30}
                />
                {addEmailForm.customAddress && addEmailForm.customAddress.length < 2 && (
                  <p className="text-sm text-red-600">邮箱前缀至少需要2个字符</p>
                )}
              </div>

              {!addEmailForm.isPermanent && (
                <div className="space-y-2">
                  <Label htmlFor="expiryHours">有效期（小时）</Label>
                  <Input
                    id="expiryHours"
                    type="number"
                    min="1"
                    max="8760"
                    value={addEmailForm.expiryHours}
                    onChange={(e) =>
                      setAddEmailForm(prev => ({ ...prev, expiryHours: parseInt(e.target.value) || 24 }))
                    }
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddEmailDialog(false)}
                disabled={actionLoading}
              >
                取消
              </Button>
              <Button
                onClick={handleAddEmailForUser}
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                添加邮箱
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 用户邮箱管理对话框 */}
        <Dialog open={showUserEmailsDialog} onOpenChange={setShowUserEmailsDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>邮箱管理 - {selectedUser?.username}</DialogTitle>
              <DialogDescription>
                管理用户的所有邮箱地址
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {userEmails.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>该用户暂无邮箱</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userEmails.map((email) => (
                    <div
                      key={email.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        email.isPermanent
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200'
                          : email.isExpired
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Mail className="h-4 w-4 text-primary/60" />
                          {email.isPermanent && (
                            <Crown className="h-3 w-3 text-yellow-600" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{email.address}</span>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>创建: {new Date(email.createdAt).toLocaleDateString()}</span>
                            {!email.isPermanent && (
                              <span className={email.isExpired ? 'text-red-600' : ''}>
                                过期: {new Date(email.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {email.isPermanent && (
                          <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">
                            永久
                          </Badge>
                        )}
                        {email.isExpired && (
                          <Badge variant="destructive" className="text-xs">
                            已过期
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteEmail(email.id)}
                          disabled={actionLoading}
                          className="text-red-600 hover:text-red-700"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowUserEmailsDialog(false)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除用户确认对话框 */}
        <Dialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600">确认删除用户</DialogTitle>
              <DialogDescription>
                您即将删除用户 <strong>{selectedUser?.username}</strong>，此操作将：
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2">⚠️ 警告：此操作不可撤销</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• 永久删除用户账号</li>
                  <li>• 删除用户的所有邮箱地址（{selectedUser?.emailCount || 0} 个）</li>
                  <li>• 删除用户的所有API密钥</li>
                  <li>• 删除用户的激活码</li>
                  <li>• 删除用户的角色分配</li>
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  用户信息：{selectedUser?.username}
                  {selectedUser?.name && ` (${selectedUser.name})`}
                  - {roleNames[selectedUser?.primaryRole as keyof typeof roleNames]}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteUserDialog(false)}
                disabled={actionLoading}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteUser}
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
