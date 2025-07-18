# 任务1：数据库架构扩展 - 实施记录

## 任务概述
扩展现有数据库架构以支持卡密系统和学生角色功能。

## 实施内容

### 1. 扩展 emails 表
- ✅ 添加 `isPermanent` 字段（布尔类型，默认 false）
- ✅ 保持现有索引和约束不变
- ✅ 使用 snake_case 命名规范（is_permanent）

### 2. 新增 activationCodes 表
- ✅ 表名：`activation_code`（遵循现有命名规范）
- ✅ 字段设计：
  - `id`: 主键，使用 crypto.randomUUID()
  - `code`: 卡密码，唯一约束
  - `status`: 状态（unused/used/expired/disabled），默认 unused
  - `createdAt`: 创建时间（timestamp_ms）
  - `expiresAt`: 过期时间（timestamp_ms，可为 NULL）
  - `usedAt`: 使用时间（timestamp_ms，可为 NULL）
  - `usedByUserId`: 使用者用户ID，外键关联 users.id

### 3. 索引设计
- ✅ `code` 字段唯一索引（activation_code_code_idx）
- ✅ `status` 字段普通索引（activation_code_status_idx）
- ✅ `expiresAt` 字段普通索引（activation_code_expires_at_idx）

### 4. 外键关系
- ✅ `usedByUserId` 关联 `users.id`，删除时设为 NULL
- ✅ 建立 Drizzle ORM 关系定义

### 5. 关系定义
- ✅ `activationCodesRelations`: 定义与 users 的关系
- ✅ `usersRelations`: 添加 activationCodes 关系

## 验证结果
- ✅ TypeScript 编译无错误
- ✅ 符合 Drizzle ORM 规范
- ✅ 遵循现有命名和结构规范
- ✅ 外键约束正确建立
- ✅ 索引设计合理，支持高效查询

## 技术细节
- 使用 `integer` 类型配合 `mode: "boolean"` 实现布尔字段
- 使用 `mode: "timestamp_ms"` 确保时间戳精度
- 外键删除策略：`onDelete: "set null"` 保证数据完整性
- 索引命名遵循现有规范：`表名_字段名_idx`

## 下一步
准备生成数据库迁移脚本，执行任务2。
