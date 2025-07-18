"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Search, Loader2, UserCheck, UserX, Mail, Plus, Crown } from "lucide-react"
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

interface Student {
  id: string
  username: string
  name: string | null
  enabled: boolean
  emails: Array<{
    id: string
    address: string
    isPermanent: boolean
    expiresAt: number
  }>
  emailCount: number
  permanentEmailCount: number
}

interface AddEmailForm {
  isPermanent: boolean
  customAddress: string
  expiryHours: number
}

interface StudentsResponse {
  students: Student[]
  total: number
}

interface StudentStatusResponse {
  success: boolean
  message: string
  student: {
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

export function StudentManagementPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false)
  const [addEmailForm, setAddEmailForm] = useState<AddEmailForm>({
    isPermanent: false,
    customAddress: "",
    expiryHours: 24
  })
  const [actionLoading, setActionLoading] = useState(false)
  const { toast } = useToast()

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchText) params.append('search', searchText)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`/api/admin/students?${params}`)
      if (!response.ok) throw new Error("获取学生列表失败")

      const data = await response.json() as StudentsResponse
      setStudents(data.students)
    } catch {
      toast({
        title: "获取失败",
        description: "获取学生列表失败",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [searchText, statusFilter, toast])

  useEffect(() => {
    fetchStudents()
  }, [searchText, statusFilter, fetchStudents])

  const handleToggleStudentStatus = async (student: Student) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !student.enabled })
      })

      if (!response.ok) throw new Error("更新学生状态失败")

      const data = await response.json() as StudentStatusResponse
      toast({
        title: "操作成功",
        description: data.message
      })

      // 刷新列表
      fetchStudents()
    } catch (error) {
      toast({
        title: "操作失败",
        description: error instanceof Error ? error.message : "更新学生状态失败",
        variant: "destructive"
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddEmailForStudent = async () => {
    if (!selectedStudent) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/students/${selectedStudent.id}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addEmailForm)
      })

      if (!response.ok) throw new Error("为学生添加邮箱失败")

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
      setSelectedStudent(null)

      // 刷新列表
      fetchStudents()
    } catch (error) {
      toast({
        title: "添加失败",
        description: error instanceof Error ? error.message : "为学生添加邮箱失败",
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
          学生管理
        </CardTitle>
        <CardDescription>
          管理通过卡密激活的学生账号，可以禁用账号或为学生添加邮箱
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 搜索和筛选 */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="搜索学生用户名..."
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
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="enabled">已启用</SelectItem>
              <SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 学生列表 */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
            <span className="ml-2 text-sm text-gray-500">加载学生列表...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>暂无学生数据</p>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{student.username}</span>
                      {student.name && (
                        <span className="text-sm text-gray-500">({student.name})</span>
                      )}
                      <Badge variant={student.enabled ? "default" : "destructive"}>
                        {student.enabled ? "已启用" : "已禁用"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {student.emailCount} 个邮箱
                      </span>
                      {student.permanentEmailCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Crown className="h-3 w-3 text-yellow-600" />
                          {student.permanentEmailCount} 个永久邮箱
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedStudent(student)
                      setShowAddEmailDialog(true)
                    }}
                    disabled={!student.enabled}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加邮箱
                  </Button>
                  
                  <Button
                    variant={student.enabled ? "destructive" : "default"}
                    size="sm"
                    onClick={() => handleToggleStudentStatus(student)}
                    disabled={actionLoading}
                  >
                    {student.enabled ? (
                      <>
                        <UserX className="h-4 w-4 mr-1" />
                        禁用
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-1" />
                        启用
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加邮箱对话框 */}
        <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>为学生添加邮箱</DialogTitle>
              <DialogDescription>
                为学生 {selectedStudent?.username} 添加新的邮箱地址
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isPermanent"
                  checked={addEmailForm.isPermanent}
                  onCheckedChange={(checked) => 
                    setAddEmailForm(prev => ({ ...prev, isPermanent: checked }))
                  }
                />
                <Label htmlFor="isPermanent">永久邮箱</Label>
              </div>
              
              <div>
                <Label htmlFor="customAddress">自定义邮箱地址（可选）</Label>
                <Input
                  id="customAddress"
                  placeholder="留空则自动生成"
                  value={addEmailForm.customAddress}
                  onChange={(e) => 
                    setAddEmailForm(prev => ({ ...prev, customAddress: e.target.value }))
                  }
                />
              </div>
              
              {!addEmailForm.isPermanent && (
                <div>
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
              >
                取消
              </Button>
              <Button
                onClick={handleAddEmailForStudent}
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                添加邮箱
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
