"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { CreateDialog } from "./create-dialog"
import { Mail, RefreshCw, Trash2, Star, Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ROLES, PERMISSIONS } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"
import { useRolePermission } from "@/hooks/use-role-permission"

interface Email {
  id: string
  address: string
  createdAt: number
  expiresAt: number
  isPermanent?: boolean
}

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  selectedEmailId?: string
}

interface EmailResponse {
  emails: Email[]
  nextCursor: string | null
  total: number
}

export function EmailList({ onEmailSelect, selectedEmailId }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const { checkPermission } = useRolePermission()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null)
  const [emailToSetPermanent, setEmailToSetPermanent] = useState<Email | null>(null)
  const [settingPermanent, setSettingPermanent] = useState(false)
  const { toast } = useToast()

  const canSetPermanentEmail = checkPermission(PERMISSIONS.SET_PERMANENT_EMAIL)
  const hasPermanentEmail = emails.some(email => email.isPermanent)

  const fetchEmails = useCallback(async (cursor?: string) => {
    try {
      const url = new URL("/api/emails", window.location.origin)
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      const response = await fetch(url)
      const data = await response.json() as EmailResponse
      
      if (!cursor) {
        const newEmails = data.emails
        const oldEmails = emails

        const lastDuplicateIndex = newEmails.findIndex(
          newEmail => oldEmails.some(oldEmail => oldEmail.id === newEmail.id)
        )

        if (lastDuplicateIndex === -1) {
          setEmails(newEmails)
          setNextCursor(data.nextCursor)
          setTotal(data.total)
          return
        }
        const uniqueNewEmails = newEmails.slice(0, lastDuplicateIndex)
        setEmails([...uniqueNewEmails, ...oldEmails])
        setTotal(data.total)
        return
      }
      setEmails(prev => [...prev, ...data.emails])
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [emails])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchEmails()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchEmails(nextCursor)
    }
  }, 200)

  useEffect(() => {
    if (session) fetchEmails()
  }, [session])

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: "错误",
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      setEmails(prev => prev.filter(e => e.id !== email.id))
      setTotal(prev => prev - 1)

      toast({
        title: "成功",
        description: "邮箱已删除"
      })

      if (selectedEmailId === email.id) {
        onEmailSelect(null)
      }
    } catch {
      toast({
        title: "错误",
        description: "删除邮箱失败",
        variant: "destructive"
      })
    } finally {
      setEmailToDelete(null)
    }
  }

  const handleSetPermanent = async (email: Email) => {
    setSettingPermanent(true)
    try {
      const response = await fetch('/api/emails/set-permanent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id })
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: "设置失败",
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      // 更新本地状态
      setEmails(prev => prev.map(e =>
        e.id === email.id
          ? { ...e, isPermanent: true, expiresAt: new Date('9999-01-01').getTime() }
          : e
      ))

      toast({
        title: "设置成功",
        description: "永久邮箱设置成功！",
      })
    } catch {
      toast({
        title: "设置失败",
        description: "设置永久邮箱失败，请稍后重试",
        variant: "destructive"
      })
    } finally {
      setSettingPermanent(false)
      setEmailToSetPermanent(null)
    }
  }

  if (!session) return null

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-2 flex justify-between items-center border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn("h-8 w-8", refreshing && "animate-spin")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-500">
              {role === ROLES.EMPEROR ? (
                `${total}/∞ 个邮箱`
              ) : (
                `${total}/${config?.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS} 个邮箱`
              )}
            </span>
          </div>
          <CreateDialog onEmailCreated={handleRefresh} />
        </div>
        
        <div className="flex-1 overflow-auto p-2" onScroll={handleScroll}>
          {loading ? (
            <div className="text-center text-sm text-gray-500">加载中...</div>
          ) : emails.length > 0 ? (
            <div className="space-y-1">
              {emails.map(email => (
                <div
                  key={email.id}
                  className={cn("flex items-center gap-2 p-2 rounded cursor-pointer text-sm group",
                    "hover:bg-primary/5",
                    selectedEmailId === email.id && "bg-primary/10",
                    email.isPermanent && "bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200"
                  )}
                  onClick={() => onEmailSelect(email)}
                >
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4 text-primary/60" />
                    {email.isPermanent && (
                      <Crown className="h-3 w-3 text-yellow-600" title="永久邮箱" />
                    )}
                  </div>
                  <div className="truncate flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{email.address}</span>
                      {email.isPermanent && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-medium">
                          永久
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {email.isPermanent || new Date(email.expiresAt).getFullYear() === 9999 ? (
                        "永久有效"
                      ) : (
                        `过期时间: ${new Date(email.expiresAt).toLocaleString()}`
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canSetPermanentEmail && !email.isPermanent && !hasPermanentEmail && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEmailToSetPermanent(email)
                        }}
                        title="设为永久邮箱"
                      >
                        <Star className="h-4 w-4 text-yellow-600" />
                      </Button>
                    )}
                    {!email.isPermanent && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEmailToDelete(email)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  加载更多...
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">
              还没有邮箱，创建一个吧！
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!emailToDelete} onOpenChange={() => setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除邮箱 {emailToDelete?.address} 吗？此操作将同时删除该邮箱中的所有邮件，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => emailToDelete && handleDelete(emailToDelete)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!emailToSetPermanent} onOpenChange={() => setEmailToSetPermanent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>设置永久邮箱</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将邮箱 {emailToSetPermanent?.address} 设置为永久邮箱吗？
              <br />
              <br />
              <strong>注意：</strong>
              <br />
              • 永久邮箱将不会过期，可以长期使用
              <br />
              • 每个学生账户只能设置一个永久邮箱
              <br />
              • 设置后无法撤销，请谨慎选择
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={settingPermanent}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 hover:bg-yellow-700"
              onClick={() => emailToSetPermanent && handleSetPermanent(emailToSetPermanent)}
              disabled={settingPermanent}
            >
              {settingPermanent ? "设置中..." : "确认设置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
} 