import { Category } from '../models/Category.js';
import { Topic } from '../models/Topic.js';
import { Post } from '../models/Post.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/* ---------- Categories ---------- */

// GET /api/forum/categories
export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ order: 1 });

  const categoriesWithStats = await Promise.all(
    categories.map(async (c) => {
      const topicIds = await Topic.find({ category: c._id }).distinct('_id');
      const [topicCount, postCount, latestTopic] = await Promise.all([
        Topic.countDocuments({ category: c._id }),
        Post.countDocuments({ topic: { $in: topicIds } }),
        Topic.findOne({ category: c._id })
          .sort({ lastActivity: -1 })
          .populate('author', 'username')
          .populate('lastPost')
      ]);

      let lastActivity = null;
      let lastUser = null;

      if (latestTopic) {
        lastActivity = latestTopic.lastActivity;
        if (latestTopic.lastPost) {
          const lp = await Post.findById(latestTopic.lastPost).populate('author', 'username');
          lastUser = lp ? lp.author.username : latestTopic.author.username;
        } else {
          lastUser = latestTopic.author.username;
        }
      }

      return {
        id: c._id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        topicCount,
        postCount,
        lastActivity,
        lastUser
      };
    })
  );

  res.json({ categories: categoriesWithStats });
});

// POST /api/forum/init
export const initCategories = asyncHandler(async (_req, res) => {
  const existing = await Category.countDocuments();
  if (existing > 0) return res.json({ message: 'Categories already initialized' });

  const defaultCategories = [
    { name: 'General Discussion', description: 'General cybersecurity topics and community discussions', icon: '💬', order: 1 },
    { name: 'Vulnerability Research', description: 'Share your security research and vulnerability discoveries', icon: '🔍', order: 2 },
    { name: 'CTF & Challenges', description: 'Capture The Flag discussions, writeups, and practice', icon: '🚩', order: 3 },
    { name: 'Tools & Tutorials', description: 'Share security tools, scripts, and learning resources', icon: '🛠️', order: 4 },
    { name: 'Job Board', description: 'Security job postings and career discussions', icon: '💼', order: 5 },
    { name: 'Meetup Planning', description: 'Organize events, suggest topics, and coordinate meetups', icon: '📅', order: 6 }
  ];

  await Category.insertMany(defaultCategories);
  res.status(201).json({ message: 'Forum categories initialized successfully', categories: defaultCategories.length });
});

/* ---------- Topics ---------- */

// GET /api/forum/categories/:categoryId/topics
export const listCategoryTopics = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const topics = await Topic.find({ category: categoryId })
    .populate('author', 'username tag')
    .populate('lastPost')
    .sort({ isPinned: -1, lastActivity: -1 })
    .skip(skip)
    .limit(limit);

  const topicsWithStats = await Promise.all(
    topics.map(async t => {
      const replyCount = await Post.countDocuments({ topic: t._id });

      let lastUser = t.author.username;
      let lastReply = t.createdAt;

      if (t.lastPost) {
        const lastPost = await Post.findById(t.lastPost).populate('author', 'username');
        if (lastPost) {
          lastUser = lastPost.author.username;
          lastReply = lastPost.createdAt;
        }
      }

      return {
        id: t._id,
        title: t.title,
        author: t.author.username,
        authorTag: t.author.tag,
        replies: replyCount,
        views: t.views,
        lastReply,
        lastUser,
        isPinned: t.isPinned,
        isLocked: t.isLocked,
        createdAt: t.createdAt
      };
    })
  );

  const totalTopics = await Topic.countDocuments({ category: categoryId });
  const totalPages = Math.ceil(totalTopics / limit);

  res.json({
    topics: topicsWithStats,
    pagination: {
      currentPage: page,
      totalPages,
      totalTopics,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

// POST /api/forum/categories/:categoryId/topics (auth)
export const createTopic = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { title, content } = req.body;

  if (!title || !content) return res.status(400).json({ message: 'Title and content are required' });
  if (title.length > 200) return res.status(400).json({ message: 'Title must be 200 characters or less' });
  if (content.length > 10000) return res.status(400).json({ message: 'Content must be 10000 characters or less' });

  const category = await Category.findById(categoryId);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  const topic = new Topic({
    title,
    content,
    author: req.user._id,
    category: categoryId
  });
  await topic.save();

  const post = new Post({
    content,
    author: req.user._id,
    topic: topic._id
  });
  await post.save();

  topic.lastPost = post._id;
  await topic.save();

  const populated = await Topic.findById(topic._id).populate('author', 'username tag');

  res.status(201).json({
    message: 'Topic created successfully',
    topic: {
      id: populated._id,
      title: populated.title,
      author: populated.author.username,
      authorTag: populated.author.tag,
      createdAt: populated.createdAt
    }
  });
});

/* ---------- Posts & Topics detail ---------- */

// GET /api/forum/topics/:topicId/posts
export const getTopicPosts = asyncHandler(async (req, res) => {
  const { topicId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  await Topic.findByIdAndUpdate(topicId, { $inc: { views: 1 } });

  const topic = await Topic.findById(topicId)
    .populate('author', 'username tag')
    .populate('category', 'name');

  if (!topic) return res.status(404).json({ message: 'Topic not found' });

  const posts = await Post.find({ topic: topicId })
    .populate('author', 'username tag createdAt')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  const totalPosts = await Post.countDocuments({ topic: topicId });
  const totalPages = Math.ceil(totalPosts / limit);

  res.json({
    topic: {
      id: topic._id,
      title: topic.title,
      author: topic.author.username,
      authorTag: topic.author.tag,
      category: topic.category.name,
      views: topic.views,
      isPinned: topic.isPinned,
      isLocked: topic.isLocked,
      createdAt: topic.createdAt
    },
    posts: posts.map(p => ({
      id: p._id,
      content: p.content,
      author: p.author.username,
      authorTag: p.author.tag,
      isEdited: p.isEdited,
      editedAt: p.editedAt,
      createdAt: p.createdAt
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalPosts,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

// POST /api/forum/topics/:topicId/posts (auth)
export const createPost = asyncHandler(async (req, res) => {
  const { topicId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ message: 'Content is required' });
  if (content.length > 10000) return res.status(400).json({ message: 'Content must be 10000 characters or less' });

  const topic = await Topic.findById(topicId);
  if (!topic) return res.status(404).json({ message: 'Topic not found' });
  if (topic.isLocked) return res.status(403).json({ message: 'Topic is locked' });

  const post = await Post.create({ content: content.trim(), author: req.user._id, topic: topicId });
  const populated = await Post.findById(post._id).populate('author', 'username tag');

  res.status(201).json({
    message: 'Post created successfully',
    post: {
      id: populated._id,
      content: populated.content,
      author: populated.author.username,
      authorTag: populated.author.tag,
      createdAt: populated.createdAt
    }
  });
});

// PUT /api/forum/posts/:postId (auth; only owner)
export const updatePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ message: 'Content is required' });
  if (content.length > 10000) return res.status(400).json({ message: 'Content must be 10000 characters or less' });

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  if (post.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You can only edit your own posts' });
  }

  post.content = content.trim();
  post.isEdited = true;
  post.editedAt = new Date();
  await post.save();

  res.json({
    message: 'Post updated successfully',
    post: {
      id: post._id,
      content: post.content,
      isEdited: post.isEdited,
      editedAt: post.editedAt
    }
  });
});

// DELETE /api/forum/posts/:postId (auth; owner or admin)
export const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });

  const canDelete = post.author.toString() === req.user._id.toString() || req.user.isAdmin;
  if (!canDelete) return res.status(403).json({ message: 'You can only delete your own posts' });

  const topicId = post.topic;

  const firstPost = await Post.findOne({ topic: topicId }).sort({ createdAt: 1 });
  const isOriginalPost = firstPost && firstPost._id.toString() === postId;

  if (isOriginalPost) {
    await Post.deleteMany({ topic: topicId });
    await Topic.findByIdAndDelete(topicId);

    const actionBy = req.user.isAdmin && post.author.toString() !== req.user._id.toString() ? 'admin' : 'author';

    return res.json({
      message: `Original post deleted - entire topic removed${actionBy === 'admin' ? ' by admin' : ''}`,
      postId,
      topicDeleted: true,
      topicId,
      deletedBy: actionBy
    });
  }

  await Post.findByIdAndDelete(postId);

  const remaining = await Post.find({ topic: topicId }).sort({ createdAt: -1 });
  const topic = await Topic.findById(topicId);

  if (remaining.length > 0) {
    topic.lastPost = remaining[0]._id;
    topic.lastActivity = remaining[0].createdAt;
  } else {
    topic.lastPost = null;
    topic.lastActivity = topic.createdAt;
  }
  await topic.save();

  const actionBy = req.user.isAdmin && post.author.toString() !== req.user._id.toString() ? 'admin' : 'author';

  res.json({
    message: `Post deleted successfully${actionBy === 'admin' ? ' by admin' : ''}`,
    postId,
    topicDeleted: false,
    deletedBy: actionBy
  });
});

// DELETE /api/forum/topics/:topicId (auth; owner or admin)
export const deleteTopic = asyncHandler(async (req, res) => {
  const { topicId } = req.params;

  const topic = await Topic.findById(topicId).populate('author');
  if (!topic) return res.status(404).json({ message: 'Topic not found' });

  const canDelete = topic.author._id.toString() === req.user._id.toString() || req.user.isAdmin;
  if (!canDelete) return res.status(403).json({ message: 'You can only delete your own topics' });

  await Post.deleteMany({ topic: topicId });
  await Topic.findByIdAndDelete(topicId);

  const actionBy = req.user.isAdmin && topic.author._id.toString() !== req.user._id.toString() ? 'admin' : 'author';

  res.json({
    message: `Topic and all its posts deleted successfully${actionBy === 'admin' ? ' by admin' : ''}`,
    topicId,
    deletedBy: actionBy
  });
});

// GET /api/forum/search
export const searchForum = asyncHandler(async (req, res) => {
  const { q, category, page = 1, limit = 20 } = req.query;

  if (!q || q.trim().length < 3) {
    return res.status(400).json({ message: 'Search query must be at least 3 characters' });
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const searchRegex = new RegExp(q.trim(), 'i');

  const filter = {
    $or: [{ title: searchRegex }, { content: searchRegex }]
  };

  if (category) filter.category = category;

  const topics = await Topic.find(filter)
    .populate('author', 'username tag')
    .populate('category', 'name')
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalResults = await Topic.countDocuments(filter);
  const totalPages = Math.ceil(totalResults / parseInt(limit));

  res.json({
    results: topics.map(topic => ({
      id: topic._id,
      title: topic.title,
      author: topic.author.username,
      category: topic.category.name,
      lastActivity: topic.lastActivity,
      views: topic.views
    })),
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalResults,
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1
    },
    searchQuery: q.trim()
  });
});
