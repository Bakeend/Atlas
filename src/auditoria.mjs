import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap(entry => {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) return getFiles(full)

    return extensions.has(path.extname(entry.name))
      ? [full]
      : []
  })
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/')
}

function count(content, regex) {
  return [...content.matchAll(regex)].length
}

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/).length

  const warnings = []
  const critical = []

  if (lines > 500) warnings.push(`arquivo grande: ${lines} linhas`)

  const anyCount = count(content, /\bany\b/g)
  if (anyCount > 0) warnings.push(`${anyCount} usos de any`)

  const inlineStyle = count(content, /style=\{\{/g)
  if (inlineStyle > 0) warnings.push(`${inlineStyle} styles inline`)

  const consoleLogs = count(content, /console\.log/g)
  if (consoleLogs > 0) warnings.push(`${consoleLogs} console.log`)

  const todos = count(content, /\bTODO\b/gi)
  if (todos > 0) warnings.push(`${todos} TODO`)

  const fixmes = count(content, /\bFIXME\b/gi)
  if (fixmes > 0) warnings.push(`${fixmes} FIXME`)

  const tsIgnore = count(content, /@ts-ignore/g)
  if (tsIgnore > 0) critical.push(`${tsIgnore} @ts-ignore`)

  const nativeSelect = count(content, /<select\b/gi)
  if (nativeSelect > 0) warnings.push(`${nativeSelect} select nativo`)

  const nativeDate = count(content, /type=["']date["']/gi)
  if (nativeDate > 0) warnings.push(`${nativeDate} input date nativo`)

  const nativeNumber = count(content, /type=["']number["']/gi)
  if (nativeNumber > 0) warnings.push(`${nativeNumber} input number nativo`)

  const aiRefs = count(
    content,
    /OpenRouter|OpenAI|AiAssistant|useAiChat|agentLoop|tool_calls/gi
  )

  if (aiRefs > 0) warnings.push(`${aiRefs} referências de IA`)

  return {
    file: relative(file),
    lines,
    warnings,
    critical
  }
}

console.clear()

console.log('========================================')
console.log('       AUDITORIA COMPLETA - ATLAS')
console.log('========================================')
console.log('')

const files = getFiles(SRC)

const results = []

files.forEach((file, index) => {
  const result = checkFile(file)
  results.push(result)

  console.log(`[${index + 1}/${files.length}] ${result.file}`)

  if (!result.warnings.length && !result.critical.length) {
    console.log('  ✓ OK')
  }

  result.warnings.forEach(msg => {
    console.log(`  ⚠ ${msg}`)
  })

  result.critical.forEach(msg => {
    console.log(`  ✖ ${msg}`)
  })

  console.log('')
})

console.log('Verificando TypeScript...')

try {
  execSync('npm run lint', {
    stdio: 'inherit'
  })
  console.log('✓ TypeScript OK')
} catch {
  console.log('✖ Erro no TypeScript')
}

console.log('')
console.log('Verificando build...')

try {
  execSync('npm run build', {
    stdio: 'inherit'
  })
  console.log('✓ Build OK')
} catch {
  console.log('✖ Build com erro')
}

const ok = results.filter(
  r => !r.warnings.length && !r.critical.length
).length

const warn = results.filter(
  r => r.warnings.length && !r.critical.length
).length

const crit = results.filter(
  r => r.critical.length
).length

console.log('')
console.log('========================================')
console.log('RESUMO')
console.log('========================================')
console.log(`Arquivos analisados: ${results.length}`)
console.log(`OK: ${ok}`)
console.log(`Avisos: ${warn}`)
console.log(`Críticos: ${crit}`)