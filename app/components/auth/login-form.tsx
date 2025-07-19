"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Github, Loader2, KeyRound, User2, Ticket, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormErrors {
  username?: string
  password?: string
  confirmPassword?: string
  activationCode?: string
  permanentEmail?: string
}

export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [activationCode, setActivationCode] = useState("")
  const [permanentEmail, setPermanentEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const { toast } = useToast()

  const validateLoginForm = () => {
    const newErrors: FormErrors = {}
    if (!username) newErrors.username = "请输入用户名"
    if (!password) newErrors.password = "请输入密码"
    if (username.includes('@')) newErrors.username = "用户名不能包含 @ 符号"
    if (password && password.length < 8) newErrors.password = "密码长度必须大于等于8位"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateRegisterForm = () => {
    const newErrors: FormErrors = {}
    if (!username) newErrors.username = "请输入用户名"
    if (!password) newErrors.password = "请输入密码"
    if (username.includes('@')) newErrors.username = "用户名不能包含 @ 符号"
    if (password && password.length < 8) newErrors.password = "密码长度必须大于等于8位"
    if (!confirmPassword) newErrors.confirmPassword = "请确认密码"
    if (password !== confirmPassword) newErrors.confirmPassword = "两次输入的密码不一致"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateActivateForm = () => {
    const newErrors: FormErrors = {}
    if (!activationCode) newErrors.activationCode = "请输入卡密"
    if (!username) newErrors.username = "请输入用户名"
    if (!password) newErrors.password = "请输入密码"
    if (!permanentEmail) newErrors.permanentEmail = "请输入永久邮箱名"
    if (username.includes('@')) newErrors.username = "用户名不能包含 @ 符号"
    if (password && password.length < 8) newErrors.password = "密码长度必须大于等于8位"
    if (permanentEmail && !/^[a-zA-Z0-9_-]+$/.test(permanentEmail)) {
      newErrors.permanentEmail = "邮箱名只能包含字母、数字、下划线和横杠"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async () => {
    if (!validateLoginForm()) return

    setLoading(true)
    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast({
          title: "登录失败",
          description: "用户名或密码错误",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      window.location.href = "/"
    } catch (error) {
      toast({
        title: "登录失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!validateRegisterForm()) return

    setLoading(true)
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json() as { error?: string }

      if (!response.ok) {
        toast({
          title: "注册失败",
          description: data.error || "请稍后重试",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      // 注册成功后自动登录
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast({
          title: "登录失败",
          description: "自动登录失败，请手动登录",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      window.location.href = "/"
    } catch (error) {
      toast({
        title: "注册失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!validateActivateForm()) return

    setLoading(true)
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activationCode,
          username,
          password,
          permanentEmail
        }),
      })

      const data = await response.json() as { error?: string; success?: boolean }

      if (!response.ok) {
        toast({
          title: "激活失败",
          description: data.error || "请稍后重试",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      // 激活成功，显示成功消息
      toast({
        title: "激活成功！",
        description: "学生账户已创建，正在自动登录...",
      })

      // 激活成功后自动登录
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast({
          title: "登录失败",
          description: "自动登录失败，请手动登录",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      window.location.href = "/"
    } catch (error) {
      toast({
        title: "激活失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const handleGithubLogin = () => {
    signIn("github", { callbackUrl: "/" })
  }

  const clearForm = () => {
    setUsername("")
    setPassword("")
    setConfirmPassword("")
    setActivationCode("")
    setPermanentEmail("")
    setErrors({})
  }

  return (
    <Card className="w-[95%] max-w-lg border-2 border-primary/20">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-center bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          欢迎使用 EduMail
        </CardTitle>
        <CardDescription className="text-center">
          萌萌哒edu邮箱服务 (。・∀・)ノ
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        <Tabs defaultValue="login" className="w-full" onValueChange={clearForm}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
            <TabsTrigger value="activate">卡密激活</TabsTrigger>
          </TabsList>
          <div className="min-h-[220px]">
            <TabsContent value="login" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <User2 className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.username && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder="用户名"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs text-destructive">{errors.username}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.password && "border-destructive focus-visible:ring-destructive"
                      )}
                      type="password"
                      placeholder="密码"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <Button
                  className="w-full"
                  onClick={handleLogin}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  登录
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      或者
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGithubLogin}
                >
                  <Github className="mr-2 h-4 w-4" />
                  使用 GitHub 账号登录
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="register" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <User2 className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.username && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder="用户名"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs text-destructive">{errors.username}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.password && "border-destructive focus-visible:ring-destructive"
                      )}
                      type="password"
                      placeholder="密码"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.confirmPassword && "border-destructive focus-visible:ring-destructive"
                      )}
                      type="password"
                      placeholder="确认密码"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <Button
                  className="w-full"
                  onClick={handleRegister}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  注册
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="activate" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <Ticket className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.activationCode && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder="卡密（如：ABCD-1234-EFGH）"
                      value={activationCode}
                      onChange={(e) => {
                        setActivationCode(e.target.value.toUpperCase())
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.activationCode && (
                    <p className="text-xs text-destructive">{errors.activationCode}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <User2 className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.username && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder="用户名"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs text-destructive">{errors.username}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.password && "border-destructive focus-visible:ring-destructive"
                      )}
                      type="password"
                      placeholder="密码"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <Mail className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.permanentEmail && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder="永久邮箱名（如：myemail）"
                      value={permanentEmail}
                      onChange={(e) => {
                        setPermanentEmail(e.target.value.toLowerCase())
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.permanentEmail && (
                    <p className="text-xs text-destructive">{errors.permanentEmail}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    激活后将获得 edu 永久邮箱
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <Button
                  className="w-full"
                  onClick={handleActivate}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  激活学生账户
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}