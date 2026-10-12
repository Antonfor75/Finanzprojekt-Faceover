// Weiche vor den Server Actions: Komponenten importieren ihre Actions von hier.
// Live → echte Server Action (Supabase). Demo → lokaler Nachbau, es geht keine
// einzige Anfrage an den Server.
import { isDemoMode } from './mode'
import * as demo from '@/lib/demo/demoActions'
import * as funAccount from '@/app/actions/funAccount'
import * as funGroups from '@/app/actions/funGroups'
import * as savings from '@/app/actions/savings'
import * as importActions from '@/app/actions/import'
import * as email from '@/app/actions/emailConnection'
import * as transfers from '@/app/actions/transfers'

/* eslint-disable @typescript-eslint/no-explicit-any */
function route<F extends (...args: any[]) => Promise<any>>(live: F, local: (...args: any[]) => Promise<any>): F {
    return ((...args: Parameters<F>) => (isDemoMode() ? local(...args) : live(...args))) as F
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type { ConnectionStatus } from '@/app/actions/emailConnection'

export const addFunAccount = route(funAccount.addFunAccount, demo.addFunAccount)
export const depositToFunAccount = route(funAccount.depositToFunAccount, demo.depositToFunAccount)
export const setFunAccountFeed = route(funAccount.setFunAccountFeed, demo.setFunAccountFeed)
export const addAccountExpense = route(funAccount.addAccountExpense, demo.addAccountExpense)
export const processFunAccountFeeds = route(funAccount.processFunAccountFeeds, demo.processFunAccountFeeds)

export const processWeeklySavings = route(savings.processWeeklySavings, demo.processWeeklySavings)

export const getOrCreateFunAccountV2 = route(funGroups.getOrCreateFunAccountV2, demo.getOrCreateFunAccountV2)
export const renameFunAccountV2 = route(funGroups.renameFunAccountV2, demo.renameFunAccountV2)
export const setFunAccountForesight = route(funGroups.setFunAccountForesight, demo.setFunAccountForesight)
export const createFunGroup = route(funGroups.createFunGroup, demo.createFunGroup)
export const updateFunGroup = route(funGroups.updateFunGroup, demo.updateFunGroup)
export const deleteFunGroup = route(funGroups.deleteFunGroup, demo.deleteFunGroup)
export const addFunGroupExpense = route(funGroups.addFunGroupExpense, demo.addFunGroupExpense)
export const updateFunGroupExpense = route(funGroups.updateFunGroupExpense, demo.updateFunGroupExpense)
export const deleteFunGroupExpense = route(funGroups.deleteFunGroupExpense, demo.deleteFunGroupExpense)
export const addFunIncomeEntry = route(funGroups.addFunIncomeEntry, demo.addFunIncomeEntry)
export const updateFunIncomeEntry = route(funGroups.updateFunIncomeEntry, demo.updateFunIncomeEntry)
export const deleteFunIncomeEntry = route(funGroups.deleteFunIncomeEntry, demo.deleteFunIncomeEntry)

export const bulkImportAll = route(importActions.bulkImportAll, demo.bulkImportAll)

export const createTransfer = route(transfers.createTransfer, demo.createTransfer)
export const updateTransfer = route(transfers.updateTransfer, demo.updateTransfer)
export const deleteTransfer = route(transfers.deleteTransfer, demo.deleteTransfer)

export const saveEmailConnection = route(email.saveEmailConnection, demo.saveEmailConnection)
export const getEmailConnectionStatus = route(email.getEmailConnectionStatus, demo.getEmailConnectionStatus)
export const runReweSyncNow = route(email.runReweSyncNow, demo.runReweSyncNow)
export const deleteEmailConnection = route(email.deleteEmailConnection, demo.deleteEmailConnection)
