import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { nanoid } from "nanoid"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = 'default-salt' // Use a default salt for Edge Runtime compatibility
  const data = encoder.encode(password + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  const hash = await hashPassword(password)
  return hash === hashedPassword
}

export async function generateRandomEmail(domain: string): Promise<string> {
  // 生成8位随机字符串作为邮箱名
  const randomName = nanoid(8)
  return `${randomName}@${domain}`
}