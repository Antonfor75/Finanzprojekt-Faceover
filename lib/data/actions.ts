// Weiche vor den Server Actions: Komponenten importieren ihre Actions von hier.
// Live → echte Server Action (Supabase). Demo → lokaler Nachbau, es geht keine
// einzige Anfrage an den Server.
import { isDemoMode } from './mode'
import * as funAccount from '@/app/actions/funAccount'
import * as funGroups from '@/app/actions/funGroups'
import * as savings from '@/app/actions/savings'
import * as importActions from '@/app/actions/import'
import * as transfers from '@/app/actions/transfers'
import * as startup from '@/app/actions/startup'

// Der Demo-Nachbau wird nur in der Demo nachgeladen und steckt so nicht im Paket der echten App.
type DemoActions = typeof import('@/lib/demo/demoActions')
const loadDemo = () => import('@/lib/demo/demoActions')

/* eslint-disable @typescript-eslint/no-explicit-any */
function route<F extends (...args: any[]) => Promise<any>>(live: F, local: keyof DemoActions): F {
    return ((...args: Parameters<F>) => (isDemoMode()
        ? loadDemo().then(demo => (demo[local] as (...a: any[]) => Promise<any>)(...args))
        : live(...args))) as F
}
/* eslint-enable @typescript-eslint/no-explicit-any */


export const addFunAccount = route(funAccount.addFunAccount, 'addFunAccount')
export const depositToFunAccount = route(funAccount.depositToFunAccount, 'depositToFunAccount')
export const setFunAccountFeed = route(funAccount.setFunAccountFeed, 'setFunAccountFeed')
export const addAccountExpense = route(funAccount.addAccountExpense, 'addAccountExpense')
export const processFunAccountFeeds = route(funAccount.processFunAccountFeeds, 'processFunAccountFeeds')

export const processWeeklySavings = route(savings.processWeeklySavings, 'processWeeklySavings')
export const runStartupJobs = route(startup.runStartupJobs, 'runStartupJobs')

export const getOrCreateFunAccountV2 = route(funGroups.getOrCreateFunAccountV2, 'getOrCreateFunAccountV2')
export const renameFunAccountV2 = route(funGroups.renameFunAccountV2, 'renameFunAccountV2')
export const setFunAccountForesight = route(funGroups.setFunAccountForesight, 'setFunAccountForesight')
export const createFunGroup = route(funGroups.createFunGroup, 'createFunGroup')
export const updateFunGroup = route(funGroups.updateFunGroup, 'updateFunGroup')
export const deleteFunGroup = route(funGroups.deleteFunGroup, 'deleteFunGroup')
export const addFunGroupExpense = route(funGroups.addFunGroupExpense, 'addFunGroupExpense')
export const updateFunGroupExpense = route(funGroups.updateFunGroupExpense, 'updateFunGroupExpense')
export const deleteFunGroupExpense = route(funGroups.deleteFunGroupExpense, 'deleteFunGroupExpense')
export const addFunIncomeEntry = route(funGroups.addFunIncomeEntry, 'addFunIncomeEntry')
export const updateFunIncomeEntry = route(funGroups.updateFunIncomeEntry, 'updateFunIncomeEntry')
export const deleteFunIncomeEntry = route(funGroups.deleteFunIncomeEntry, 'deleteFunIncomeEntry')

export const bulkImportAll = route(importActions.bulkImportAll, 'bulkImportAll')

export const createTransfer = route(transfers.createTransfer, 'createTransfer')
export const updateTransfer = route(transfers.updateTransfer, 'updateTransfer')
export const deleteTransfer = route(transfers.deleteTransfer, 'deleteTransfer')

