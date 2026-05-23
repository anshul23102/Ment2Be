import express from 'express';
import { 
  createTask, 
  getTasksByMentor, 
  getTasksByMentee,
  getTaskById,
  updateTask,
  deleteTask,
  getTasksByStatus,
  getTasksByMentorAndMentee,
  submitTaskProof
} from '../controllers/task.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Create a new task (requires authentication)
router.post('/', authenticateToken, createTask);

// Get all tasks for authenticated mentor
router.get('/', authenticateToken, getTasksByMentor);

// Get tasks by status for authenticated mentor
router.get('/status/:status', authenticateToken, getTasksByStatus);

// Get tasks for specific mentee by mentor
router.get('/mentor-mentee/:menteeId', authenticateToken, getTasksByMentorAndMentee);

// Get tasks by mentee (student) - for student dashboard
router.get('/mentee/:menteeId', getTasksByMentee);

// Submit task proof (files) - MUST come before /:id route
router.post('/submit-proof', authenticateToken, submitTaskProof);

// Get task by ID - requires authentication to prevent unauthenticated enumeration
router.get('/:id', authenticateToken, getTaskById);

// Update task - ownership check is enforced inside the controller
router.put('/:id', authenticateToken, updateTask);

// Delete task - ownership check is enforced inside the controller
router.delete('/:id', authenticateToken, deleteTask);

export default router;
