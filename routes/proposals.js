import express from 'express';
import prisma from '../prisma/client.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { ProposalStatus } from '@prisma/client';

const router = express.Router();
router.use(authMiddleware);


router.post('/submit/:subIdeaId',  async (req, res) => {
  const subIdeaId = parseInt(req.params.subIdeaId);
  console.log("contorl reacher here");
  const { title, description, presentationUrl } = req.body;
  const authorId = req.user.userId;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  try {
    // 1. Find the parent Idea's ID from the SubIdea
    const subIdea = await prisma.subIdea.findUnique({
      where: { id: subIdeaId },
      select: { ideaId: true }, // We only need the ideaId
    });

    if (!subIdea) {
      return res.status(404).json({ error: 'Sub-idea not found.' });
    }

    // 2. Use a transaction to do both actions at once
    const [newProposal] = await prisma.$transaction([
      // Action A: Create the new proposal
      prisma.proposal.create({
        data: {
          title,
          description,
          presentationUrl,
          author: { connect: { id: authorId } },
          subIdea: { connect: { id: subIdeaId } },
        },
      }),
      // Action B: Increment the counter on the parent Idea
      prisma.idea.update({
        where: { id: subIdea.ideaId },
        data: {
          totalProposals: {
            increment: 1,
          },
        },
      }),
    ]);
    await prisma.user.update({
      where: { id: authorId },
      data: {
        stars: { increment: 2 }, // You can change the number of stars awarded here
      },
    });
    res.status(201).json(newProposal);
  } catch (error) {
    console.error('Failed to create proposal:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Sub-idea not found.' });
    }
    res.status(500).json({ error: 'An error occurred while creating the proposal.' });
  }
});

// gets all the proposals of particular ideaid
router.get('/:id/proposals', async (req, res) => {
  const ideaId = parseInt(req.params.id);

  try {
    const proposalsForIdea = await prisma.proposal.findMany({
      // Find all proposals...
      where: {
        // ...where the related subIdea's ideaId matches the ID from the URL.
        subIdea: {
          ideaId: ideaId,
        },
      },
      orderBy: {
        createdAt: 'desc', // Show newest proposals first
      },
      include: {
        // Include details about the author of each proposal
        author: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
        // Also include which sub-idea the proposal belongs to for context
        subIdea: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(200).json(proposalsForIdea);
  } catch (error) {
    console.error(`Failed to fetch proposals for idea ${ideaId}:`, error);
    res.status(500).json({ error: 'An error occurred while fetching proposals.' });
  }
});

//accept or reject proposal only the one who created the idea can accept or create
router.patch('/:id/status',  async (req, res) => {
  try {
    // 1. Get data from the request
    const proposalId = parseInt(req.params.id);
    const loggedInUserId = req.user.userId;
    const { status, rejectionReason } = req.body; // Expects { "status": "ACCEPTED" } or { "status": "REJECTED", "rejectionReason": "..." }

    // Validate the incoming status
    if (!Object.values(ProposalStatus).includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    // 2. Fetch the proposal AND the author of its parent idea
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        subIdea: {
          select: {
            idea: {
              select: {
                authorId: true, // Get the original idea's author ID
              },
            },
          },
        },
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }

    // 3. Authorization Check: Is the current user the original idea's author?
    const ideaAuthorId = proposal.subIdea.idea.authorId;
    if (loggedInUserId !== ideaAuthorId) {
      return res.status(403).json({ error: 'Forbidden: Only the idea author can accept or reject proposals.' });
    }

    // 4. If authorized, update the proposal's status
    const updatedProposal = await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: status,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      },
    });

    res.status(200).json(updatedProposal);
  } catch (error) {
    console.error('Failed to update proposal status:', error);
    res.status(500).json({ error: 'An error occurred while updating the status.' });
  }
});




export default router;