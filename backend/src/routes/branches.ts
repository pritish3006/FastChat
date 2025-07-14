import { Router } from 'express';
import { 
  createBranch,
  getBranches,
  getBranch,
  switchBranch,
  mergeBranches,
  editMessage,
  archiveBranch,
  deleteBranch,
  getBranchHistory
} from '../controllers/branchController';

/**
 * @swagger
 * tags:
 *   name: Branches
 *   description: API for managing conversation branches and alternate conversation paths
 */

const router = Router();

/**
 * @swagger
 * /api/v1/branches/{sessionId}:
 *   post:
 *     summary: Create a new branch
 *     description: Create a new branch from the current conversation state
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Branch name
 *               fromMessageId:
 *                 type: string
 *                 description: Message ID to branch from
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       400:
 *         description: Invalid request parameters
 *       404:
 *         description: Session not found
 */
router.post('/:sessionId', createBranch);

/**
 * @swagger
 * /api/v1/branches/{sessionId}:
 *   get:
 *     summary: Get all branches
 *     description: Get all branches for a chat session
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: List of branches
 *       404:
 *         description: Session not found
 */
router.get('/:sessionId', getBranches);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/{branchId}:
 *   get:
 *     summary: Get branch details
 *     description: Get details of a specific branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Branch details
 *       404:
 *         description: Branch or session not found
 */
router.get('/:sessionId/:branchId', getBranch);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/{branchId}/switch:
 *   post:
 *     summary: Switch to a branch
 *     description: Switch the active conversation to a different branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID to switch to
 *     responses:
 *       200:
 *         description: Successfully switched branch
 *       404:
 *         description: Branch or session not found
 */
router.post('/:sessionId/:branchId/switch', switchBranch);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/merge:
 *   post:
 *     summary: Merge branches
 *     description: Merge one branch into another
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceBranchId
 *               - targetBranchId
 *             properties:
 *               sourceBranchId:
 *                 type: string
 *                 description: Branch to merge from
 *               targetBranchId:
 *                 type: string
 *                 description: Branch to merge into
 *     responses:
 *       200:
 *         description: Branches merged successfully
 *       400:
 *         description: Invalid merge request
 *       404:
 *         description: Branch or session not found
 */
router.post('/:sessionId/merge', mergeBranches);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/{branchId}/archive:
 *   post:
 *     summary: Archive a branch
 *     description: Archive a branch without deleting it
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID to archive
 *     responses:
 *       200:
 *         description: Branch archived successfully
 *       404:
 *         description: Branch or session not found
 */
router.post('/:sessionId/:branchId/archive', archiveBranch);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/{branchId}:
 *   delete:
 *     summary: Delete a branch
 *     description: Permanently delete a branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID to delete
 *     responses:
 *       204:
 *         description: Branch deleted successfully
 *       404:
 *         description: Branch or session not found
 */
router.delete('/:sessionId/:branchId', deleteBranch);

/**
 * @swagger
 * /api/v1/branches/{sessionId}/history:
 *   get:
 *     summary: Get branch history
 *     description: Get the history of branch operations for a session
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: Branch history
 *       404:
 *         description: Session not found
 */
router.get('/:sessionId/history', getBranchHistory);

/**
 * @swagger
 * /api/v1/branches/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     description: Edit a message within a branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID to edit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: New message content
 *     responses:
 *       200:
 *         description: Message edited successfully
 *       404:
 *         description: Message not found
 */
router.put('/messages/:messageId', editMessage);

export default router; 