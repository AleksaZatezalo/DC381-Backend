import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Topic } from '../models/Topic.js';
import { Post } from '../models/Post.js';
import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/admin/dashboard
export const dashboard = asyncHandler(async (req, res) => {
  const [userCount, adminCount, categoryCount, topicCount, postCount, eventCount, publishedEventCount] =
    await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true, isAdmin: true }),
      Category.countDocuments({ isActive: true }),
      Topic.countDocuments(),
      Post.countDocuments(),
      Event.countDocuments(),
      Event.countDocuments({ isPublished: true })
    ]);

  const recentUsers = await User.find({ isActive: true })
    .select('-password')
    .sort({ createdAt: -1 })
    .limit(5);

  const recentTopics = await Topic.find()
    .populate('author', 'username')
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(5);

  const recentEvents = await Event.find()
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({
    message: `Hello ${req.user.username}`,
    stats: {
      users: userCount,
      admins: adminCount,
      categories: categoryCount,
      topics: topicCount,
      posts: postCount,
      events: eventCount,
      publishedEvents: publishedEventCount
    },
    recentUsers: recentUsers.map(u => ({
      id: u._id,
      username: u.username,
      tag: u.tag,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt
    })),
    recentTopics: recentTopics.map(t => ({
      id: t._id,
      title: t.title,
      author: t.author.username,
      category: t.category.name,
      createdAt: t.createdAt
    })),
    recentEvents: recentEvents.map(e => ({
      id: e._id,
      title: e.title,
      location: e.location,
      dateTime: e.dateTime,
      isPublished: e.isPublished,
      createdBy: e.createdBy.username,
      createdAt: e.createdAt
    }))
  });
});

// GET /api/admin/users
export const listUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [users, totalUsers] = await Promise.all([
    User.find().select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments()
  ]);

  const totalPages = Math.ceil(totalUsers / limit);

  res.json({
    users: users.map(user => ({
      id: user._id,
      username: user.username,
      tag: user.tag,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalUsers,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

// PUT /api/admin/users/:userId/toggle-admin
export const toggleUserAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user.isAdmin) {
    const adminCount = await User.countDocuments({ isAdmin: true, isActive: true });
    if (adminCount <= 1) {
      return res.status(400).json({ message: 'Cannot remove admin status from the last admin user' });
    }
  }

  user.isAdmin = !user.isAdmin;
  await user.save();

  res.json({
    message: `User ${user.username} ${user.isAdmin ? 'granted' : 'revoked'} admin privileges`,
    user: { id: user._id, username: user.username, isAdmin: user.isAdmin }
  });
});

// PUT /api/admin/users/:userId/toggle-active
export const toggleUserActive = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user._id.toString()) {
    return res.status(400).json({ message: 'Cannot deactivate your own account' });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    message: `User ${user.username} ${user.isActive ? 'activated' : 'deactivated'}`,
    user: { id: user._id, username: user.username, isActive: user.isActive }
  });
});

/** ------- Admin: events (kept in admin controller as per your routes) ------- */

// GET /api/admin/events
export const listAllEvents = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [events, totalEvents] = await Promise.all([
    Event.find().populate('createdBy', 'username').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Event.countDocuments()
  ]);

  const totalPages = Math.ceil(totalEvents / limit);

  res.json({
    events: events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      dateTime: event.dateTime,
      isPublished: event.isPublished,
      createdBy: event.createdBy.username,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalEvents,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

// POST /api/admin/events
export const createEvent = asyncHandler(async (req, res) => {
  const { title, description, location, dateTime, isPublished } = req.body;

  if (!title || !description || !location || !dateTime) {
    return res.status(400).json({ message: 'Title, description, location, and date/time are required' });
  }
  if (title.length > 200) return res.status(400).json({ message: 'Title must be 200 characters or less' });
  if (description.length > 2000) return res.status(400).json({ message: 'Description must be 2000 characters or less' });
  if (location.length > 200) return res.status(400).json({ message: 'Location must be 200 characters or less' });

  const eventDate = new Date(dateTime);
  if (isNaN(eventDate.getTime())) return res.status(400).json({ message: 'Invalid date/time format' });

  const event = await Event.create({
    title: title.trim(),
    description: description.trim(),
    location: location.trim(),
    dateTime: eventDate,
    isPublished: Boolean(isPublished),
    createdBy: req.user._id
  });

  const populated = await Event.findById(event._id).populate('createdBy', 'username');

  res.status(201).json({
    message: 'Event created successfully',
    event: {
      id: populated._id,
      title: populated.title,
      description: populated.description,
      location: populated.location,
      dateTime: populated.dateTime,
      isPublished: populated.isPublished,
      createdBy: populated.createdBy.username,
      createdAt: populated.createdAt
    }
  });
});

// PUT /api/admin/events/:eventId
export const updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { title, description, location, dateTime, isPublished } = req.body;

  if (!title || !description || !location || !dateTime) {
    return res.status(400).json({ message: 'Title, description, location, and date/time are required' });
  }
  if (title.length > 200) return res.status(400).json({ message: 'Title must be 200 characters or less' });
  if (description.length > 2000) return res.status(400).json({ message: 'Description must be 2000 characters or less' });
  if (location.length > 200) return res.status(400).json({ message: 'Location must be 200 characters or less' });

  const eventDate = new Date(dateTime);
  if (isNaN(eventDate.getTime())) return res.status(400).json({ message: 'Invalid date/time format' });

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  event.title = title.trim();
  event.description = description.trim();
  event.location = location.trim();
  event.dateTime = eventDate;
  event.isPublished = Boolean(isPublished);

  await event.save();

  const populated = await Event.findById(event._id).populate('createdBy', 'username');

  res.json({
    message: 'Event updated successfully',
    event: {
      id: populated._id,
      title: populated.title,
      description: populated.description,
      location: populated.location,
      dateTime: populated.dateTime,
      isPublished: populated.isPublished,
      createdBy: populated.createdBy.username,
      updatedAt: populated.updatedAt
    }
  });
});

// DELETE /api/admin/events/:eventId
export const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  await Event.findByIdAndDelete(eventId);

  res.json({ message: 'Event deleted successfully', eventId });
});

// PUT /api/admin/events/:eventId/toggle-published
export const togglePublished = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  event.isPublished = !event.isPublished;
  await event.save();

  res.json({
    message: `Event ${event.isPublished ? 'published' : 'unpublished'} successfully`,
    event: { id: event._id, title: event.title, isPublished: event.isPublished }
  });
});
