import Task from '../models/task.model.js';
import User from '../models/user.model.js';
import mongoose from 'mongoose';

// Create a new task
export const createTask = async (req, res) => {
  try {
    const { title, description, menteeId, category, priority, dueDate, instructions, estimatedTime, resources, notifyMentee, requireSubmission, attachments, attachmentsMeta } = req.body;
    // JWT token uses 'id' field, not '_id'
    const mentorId = req.user.id || req.user._id;

    // Validate required fields
    if (!title || !menteeId) {
      return res.status(400).json({
        success: false,
        message: 'Title and menteeId are required'
      });
    }

    // Fetch mentee name from User collection
    let menteeName = 'Student';
    let mentorName = 'Mentor';
    
    try {
      const mentee = await User.findById(menteeId);
      if (mentee && mentee.name) {
        menteeName = mentee.name;
      }
    } catch (err) {
      console.error('Error fetching mentee name:', err);
    }
    
    try {
      const mentor = await User.findById(mentorId);
      if (mentor && mentor.name) {
        mentorName = mentor.name;
      }
    } catch (err) {
      console.error('Error fetching mentor name:', err);
    }

    const normalizedAttachmentsMeta = Array.isArray(attachmentsMeta)
      ? attachmentsMeta
          .filter((a) => a && a.url && a.name)
          .map((a) => ({
            name: a.name,
            size: a.size,
            type: a.type,
            url: a.url
          }))
      : [];

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.filter(Boolean)
      : [];

    const effectiveAttachments = normalizedAttachmentsMeta.length
      ? normalizedAttachmentsMeta.map((a) => a.url)
      : normalizedAttachments;

    const newTask = new Task({
      title,
      description,
      instructions,
      mentorId,
      menteeId,
      menteeName,
      mentorName,
      category: category || 'Technical Skills',
      priority: priority || 'medium',
      dueDate,
      estimatedTime,
      resources,
      notifyMentee,
      requireSubmission,
      attachments: effectiveAttachments,
      attachmentsMeta: normalizedAttachmentsMeta,
      status: 'not-started'
    });

    await newTask.save();

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: newTask
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating task: ' + error.message
    });
  }
};

// Get all tasks for a mentor
export const getTasksByMentor = async (req, res) => {
  try {
    const mentorIdString = req.user.id || req.user._id;
    
    const mentorId = new mongoose.Types.ObjectId(mentorIdString);
    
    console.log('[Task Controller] Searching for mentorId (ObjectId):', mentorId);

    let tasks = await Task.find({ mentorId })
      .populate('mentorId', 'name profilePicture')
      .sort({ createdAt: -1 });

    for (let task of tasks) {
      let needsSave = false;
      
      if (task.menteeId) {
        try {
          const mentee = await User.findById(task.menteeId);
          if (mentee && mentee.name) {
            if (!task.menteeName || task.menteeName === 'Student') {
              task.menteeName = mentee.name;
              needsSave = true;
            }
          }
        } catch (err) {
          console.error('Error fetching mentee name for task:', err);
        }
      }
      
      if (task.mentorId && typeof task.mentorId === 'object' && task.mentorId.name) {
        if (!task.mentorName || task.mentorName === 'Mentor') {
          task.mentorName = task.mentorId.name;
          needsSave = true;
        }
      }
      
      if (needsSave) {
        await task.save();
      }
    }
    
    tasks = tasks.map(task => {
      const taskObj = task.toObject ? task.toObject() : task;
      if (taskObj.mentorId && taskObj.mentorId.name) {
        taskObj.mentorName = taskObj.mentorId.name;
      }
      return taskObj;
    });

    console.log('[Task Controller] Found tasks for this mentor:', tasks.length);

    res.status(200).json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks: ' + error.message
    });
  }
};

// Get tasks by mentee
export const getTasksByMentee = async (req, res) => {
  try {
    const { menteeId } = req.params;

    console.log('[Task Controller] Fetching tasks for menteeId:', menteeId);

    const allTasks = await Task.find({});
    console.log('[Task Controller] Total tasks in database:', allTasks.length);
    allTasks.forEach(task => {
      console.log('[Task Controller] Task menteeId:', task.menteeId, 'Type:', typeof task.menteeId, 'Task:', task.title);
    });

    const tasks = await Task.find({
      $or: [
        { menteeId: menteeId },
        { menteeId: new mongoose.Types.ObjectId(menteeId) }
      ]
    })
      .populate('mentorId', 'name profilePicture')
      .sort({ createdAt: -1 });

    console.log('[Task Controller] Found tasks for mentee:', tasks.length);

    res.status(200).json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks: ' + error.message
    });
  }
};

// Get task by ID
export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id)
      .populate('mentorId', 'name profilePicture')
      .populate('menteeId', 'name profilePicture');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching task: ' + error.message
    });
  }
};

// Update task
// Access rules:
//   Mentor (task creator): may update all task fields.
//   Mentee (task assignee): may update status and progress only.
//   Any other authenticated user: 403 Forbidden.
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = (req.user.id || req.user._id).toString();

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const taskMentorId = task.mentorId.toString();
    const taskMenteeId = task.menteeId ? task.menteeId.toString() : null;

    const isMentor = requesterId === taskMentorId;
    const isMentee = taskMenteeId !== null && requesterId === taskMenteeId;

    if (!isMentor && !isMentee) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: you do not have permission to update this task'
      });
    }

    const {
      title,
      description,
      category,
      priority,
      status,
      dueDate,
      progress,
      instructions,
      estimatedTime,
      resources,
      notifyMentee,
      requireSubmission
    } = req.body;

    // Only the mentor who created the task may change its core definition fields.
    if (isMentor) {
      if (title) task.title = title;
      if (description) task.description = description;
      if (category) task.category = category;
      if (priority) task.priority = priority;
      if (dueDate) task.dueDate = dueDate;
      if (instructions) task.instructions = instructions;
      if (estimatedTime) task.estimatedTime = estimatedTime;
      if (resources) task.resources = resources;
      if (notifyMentee !== undefined) task.notifyMentee = notifyMentee;
      if (requireSubmission !== undefined) task.requireSubmission = requireSubmission;
    }

    // Both the mentor and the mentee may update status and progress.
    if (status) {
      task.status = status;
      // Auto-sync progress based on status if progress not explicitly provided
      if (progress === undefined) {
        switch (status) {
          case 'completed':
            task.progress = 100;
            break;
          case 'pending-review':
            task.progress = 80;
            break;
          case 'in-progress':
            task.progress = 50;
            break;
          case 'not-started':
            task.progress = 0;
            break;
          default:
            task.progress = 0;
        }
      }
    }
    if (progress !== undefined) task.progress = progress;

    await task.save();

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating task: ' + error.message
    });
  }
};

// Delete task
// Only the mentor who created the task is permitted to delete it.
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = (req.user.id || req.user._id).toString();

    // Fetch first so we can check ownership before deleting.
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (task.mentorId.toString() !== requesterId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: only the mentor who created this task can delete it'
      });
    }

    await Task.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting task: ' + error.message
    });
  }
};

// Get tasks by status
export const getTasksByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const mentorIdString = req.user.id || req.user._id;
    const mentorId = new mongoose.Types.ObjectId(mentorIdString);

    const tasks = await Task.find({ mentorId, status })
      .populate('menteeId', 'name profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks: ' + error.message
    });
  }
};

// Get tasks by mentor and mentee
export const getTasksByMentorAndMentee = async (req, res) => {
  try {
    const { menteeId } = req.params;
    const mentorIdString = req.user.id || req.user._id;
    const mentorId = new mongoose.Types.ObjectId(mentorIdString);

    const tasks = await Task.find({ mentorId, menteeId })
      .populate('menteeId', 'name profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks: ' + error.message
    });
  }
};

// Submit task proof (files)
export const submitTaskProof = async (req, res) => {
  try {
    let taskId = req.body?.taskId;
    
    if (!taskId && req.body) {
      taskId = Object.keys(req.body).find(key => key === 'taskId') ? req.body.taskId : null;
    }

    const userId = req.user.id || req.user._id;

    console.log('Submit proof request:', { taskId, userId, body: req.body, files: req.files });

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: 'Task ID is required'
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const menteeIdStr = task.menteeId.toString();
    const userIdStr = userId.toString();
    
    console.log('Verifying mentee:', { menteeId: menteeIdStr, userId: userIdStr });

    if (menteeIdStr !== userIdStr) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to submit proof for this task'
      });
    }

    if (!task.uploadedFiles) {
      task.uploadedFiles = [];
    }

    const files = req.body.files || [];
    
    if (files && files.length > 0) {
      files.forEach(file => {
        task.uploadedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: new Date(),
          url: file.url || null
        });
      });
    } else {
      task.uploadedFiles.push({
        name: 'Proof Submitted',
        uploadedAt: new Date().toISOString()
      });
    }

    await task.save();

    console.log('Proof submitted successfully for task:', taskId);

    res.status(200).json({
      success: true,
      message: 'Proof submitted successfully',
      task: task
    });
  } catch (error) {
    console.error('Error submitting proof:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting proof: ' + error.message
    });
  }
};
