const replacements: Array<[string, string]> = [
  ['Ã¡', 'á'], ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã¤', 'ä'],
  ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
  ['Ã­', 'í'], ['Ã¬', 'ì'], ['Ã®', 'î'], ['Ã¯', 'ï'],
  ['Ã³', 'ó'], ['Ã²', 'ò'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã¶', 'ö'],
  ['Ãº', 'ú'], ['Ã¹', 'ù'], ['Ã»', 'û'], ['Ã¼', 'ü'],
  ['Ã§', 'ç'], ['Ã±', 'ñ'],
  ['Ã', 'Á'], ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'],
  ['Ã‰', 'É'], ['ÃŠ', 'Ê'], ['Ã', 'Í'], ['Ã“', 'Ó'], ['Ã”', 'Ô'], ['Ã•', 'Õ'], ['Ãš', 'Ú'], ['Ã‡', 'Ç'],
  ['Âº', 'º'], ['Âª', 'ª'], ['Â·', '·'], ['Â ', ' '], ['Â', ''],
  ['â€“', '–'], ['â€”', '—'], ['â€˜', '‘'], ['â€™', '’'], ['â€œ', '“'], ['â€', '”'],
  ['â†’', '→'], ['â†', '←'], ['â€¢', '•'], ['âœ“', '✓'], ['âœ•', '✕'],
]

export function repairMojibake(value: string): string {
  if (!/[ÃÂâ]/.test(value)) return value
  let result = value
  for (const [broken, fixed] of replacements) result = result.split(broken).join(fixed)
  return result
}

function repairElement(element: Element) {
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    const value = element.getAttribute(attr)
    if (!value) continue
    const repaired = repairMojibake(value)
    if (repaired !== value) element.setAttribute(attr, repaired)
  }
}

function repairNode(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const value = root.nodeValue
    if (!value) return
    const repaired = repairMojibake(value)
    if (repaired !== value) root.nodeValue = repaired
    return
  }

  if (!(root instanceof Element)) return
  repairElement(root)

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    const value = current.nodeValue
    if (value) {
      const repaired = repairMojibake(value)
      if (repaired !== value) current.nodeValue = repaired
    }
    current = walker.nextNode()
  }

  root.querySelectorAll('[placeholder], [aria-label], [title]').forEach(repairElement)
}

export function installMojibakeRepair() {
  if (typeof document === 'undefined') return () => undefined

  repairNode(document.body)

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(repairNode)
      if (mutation.type === 'attributes' && mutation.target instanceof Element) repairElement(mutation.target)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title'],
  })

  return () => observer.disconnect()
}
