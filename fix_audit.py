with open('server/_core/auditMiddleware.ts', 'r') as f:
    content = f.read()

content = content.replace("import type { Context } from './context';", "import type { TrpcContext } from './context';")
content = content.replace("initTRPC.context<Context>()", "initTRPC.context<TrpcContext>()")
content = content.replace("export const auditLogMiddleware = middleware(async ({ ctx, path, type, next, rawInput }) => {", "export const auditLogMiddleware = _t.middleware(async ({ ctx, path, type, next, getRawInput }) => {")
content = content.replace("const rawInput = await opts.rawInput;", "")
content = content.replace("const redactedInput = redactPii(rawInput);", "const rawInput = await getRawInput();\n  const redactedInput = redactPii(rawInput);")
content = content.replace("actorId: ctx.user.id.toString(),", "userId: ctx.user.id.toString(),")
content = content.replace('actorId: "anonymous",', 'userId: "anonymous",')
content = content.replace("export function applyGlobalAuditMiddleware<T extends ReturnType<typeof t.router>>(", "export function applyGlobalAuditMiddleware<T extends ReturnType<typeof _t.router>>(")

with open('server/_core/auditMiddleware.ts', 'w') as f:
    f.write(content)
print("Fixed auditMiddleware.ts once and for all")
