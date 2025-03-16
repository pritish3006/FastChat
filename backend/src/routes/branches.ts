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

const router = Router();

// Branch management
router.post('/:sessionId', createBranch);
router.get('/:sessionId', getBranches);
router.get('/:sessionId/:branchId', getBranch);
router.post('/:sessionId/:branchId/switch', switchBranch);
router.post('/:sessionId/merge', mergeBranches);
router.post('/:sessionId/:branchId/archive', archiveBranch);
router.delete('/:sessionId/:branchId', deleteBranch);

// Branch history
router.get('/:sessionId/history', getBranchHistory);

// Message management within branches
router.put('/messages/:messageId', editMessage);

export default router; 