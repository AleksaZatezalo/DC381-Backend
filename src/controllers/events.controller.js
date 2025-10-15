import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/events  (public)
export const listPublicEvents = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [events, totalEvents] = await Promise.all([
    Event.find({ isPublished: true })
      .populate('createdBy', 'username')
      .sort({ dateTime: 1 })
      .skip(skip)
      .limit(limit),
    Event.countDocuments({ isPublished: true })
  ]);

  const totalPages = Math.ceil(totalEvents / limit);

  res.json({
    events: events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      dateTime: event.dateTime,
      createdBy: event.createdBy.username,
      createdAt: event.createdAt
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
