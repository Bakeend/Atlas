import { BASE_PROMPT } from './basePrompt'
import { PAYMENT_ALLOCATION_PROMPT } from './paymentAllocationPrompt'
import { FREE_MONEY_PROMPT } from './freeMoneyPrompt'
import { SAFE_DAILY_PROMPT } from './safeDailyPrompt'
import { VISUAL_BLOCKS_PROMPT } from './visualBlocksPrompt'

export const SYSTEM_PROMPT = [
  BASE_PROMPT,
  PAYMENT_ALLOCATION_PROMPT,
  FREE_MONEY_PROMPT,
  SAFE_DAILY_PROMPT,
  VISUAL_BLOCKS_PROMPT,
].join('\n\n')
