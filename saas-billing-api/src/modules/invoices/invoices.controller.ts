import { Request, Response, NextFunction } from 'express'
import { listInvoices, getInvoice, generateInvoice } from './invoices.service'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoices = await listInvoices(req.params.orgId, req.user!.userId)
    res.status(200).json({ invoices })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await getInvoice(req.params.orgId, req.params.invoiceId, req.user!.userId)
    res.status(200).json({ invoice })
  } catch (err) {
    next(err)
  }
}

export async function generate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await generateInvoice(req.params.orgId, req.user!.userId)
    res.status(201).json({ invoice })
  } catch (err) {
    next(err)
  }
}
