import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../../middleware/authenticate'
import { ingestDocument, listDocuments, getDocumentById, deleteDocument } from './documents.service'

export async function createDocumentHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { title, content } = req.body as { title: string; content: string }
    const doc = await ingestDocument(req.user!.id, title, content)
    res.status(201).json(doc)
  } catch (err) {
    next(err)
  }
}

export async function listDocumentsHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const docs = await listDocuments(req.user!.id)
    res.status(200).json(docs)
  } catch (err) {
    next(err)
  }
}

export async function getDocumentHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const documentId = parseInt(req.params['id'] as string, 10)
    const doc = await getDocumentById(req.user!.id, documentId)
    res.status(200).json(doc)
  } catch (err) {
    next(err)
  }
}

export async function deleteDocumentHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const documentId = parseInt(req.params['id'] as string, 10)
    await deleteDocument(req.user!.id, documentId)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
