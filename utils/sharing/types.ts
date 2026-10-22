export type ShareMode = 'percent' | 'amount' | 'items'
export type ItemOwner = 'creator' | 'partner'

/** key: Server-Artikel "<receipt_items.id>", lokaler Handy-Artikel "local:<id>". */
export type ShareItem = {
    key: string
    name_raw: string
    quantity: number
    unit: 'stk' | 'kg' | null
    unit_price: number | null
    total_price: number
    owner: ItemOwner
}

export type FriendState = {
    handle: string | null
    friend: { handle: string } | null
    outgoing: { id: string; handle: string } | null
    incoming: { id: string; handle: string; created_at: string }[]
    unseenShares: number
}

export type SharedPurchase = {
    id: string
    creator_id: string
    partner_id: string
    creator_expense_id: number
    partner_expense_id: number
    description: string
    expense_date: string
    category: string | null
    total: number
    mode: ShareMode
    partner_percent: number | null
    partner_amount: number
    items: ShareItem[]
    updated_by: string
    updated_at: string
}

export type SaveShareInput = {
    expenseId: number
    mode: ShareMode
    partnerPercent?: number
    partnerAmount?: number
    items?: ShareItem[]
}
