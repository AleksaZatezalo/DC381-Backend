import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listCategories, initCategories, listCategoryTopics, createTopic,
  getTopicPosts, createPost, updatePost, deletePost, deleteTopic, searchForum
} from '../controllers/forum.controller.js';

const r = Router();

// categories
r.get('/categories', listCategories);
r.post('/init', initCategories);

// topics
r.get('/categories/:categoryId/topics', listCategoryTopics);
r.post('/categories/:categoryId/topics', authenticateToken, createTopic);

// posts
r.get('/topics/:topicId/posts', getTopicPosts);
r.post('/topics/:topicId/posts', authenticateToken, createPost);
r.put('/posts/:postId', authenticateToken, updatePost);
r.delete('/posts/:postId', authenticateToken, deletePost);
r.delete('/topics/:topicId', authenticateToken, deleteTopic);

// search
r.get('/search', searchForum);

export default r;
