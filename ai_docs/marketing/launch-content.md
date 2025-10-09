# Launch Content - Recall

Marketing copy for various platforms.

---

## 🟠 Hacker News - Show HN

### Title
```
Show HN: Recall – Give Claude perfect memory across sessions with Redis
```

### First Comment (Post immediately after submitting)

```
Hey HN! I'm José, and I built Recall to solve a problem that was driving me crazy.

**The Problem:**
I use Claude for coding daily, but every conversation starts from scratch. I'd explain my architecture, coding standards, past decisions... then hit the context limit and lose everything. Next session? Start over.

**The Solution:**
Recall is an MCP (Model Context Protocol) server that gives Claude persistent memory using Redis + semantic search. Think of it as long-term memory that survives context limits and session restarts.

**How it works:**
- Claude stores important context as "memories" during conversations
- Memories are embedded (OpenAI) and stored in Redis with metadata
- Semantic search retrieves relevant memories automatically
- Works across sessions, projects, even machines (if you use cloud Redis)

**Key Features:**
- Global memories: Share context across all projects
- Relationships: Link related memories into knowledge graphs
- Versioning: Track how memories evolve over time
- Templates: Reusable patterns for common workflows
- Workspace isolation: Project A memories don't pollute Project B

**Tech Stack:**
- TypeScript + MCP SDK
- Redis for storage
- OpenAI embeddings (text-embedding-3-small)
- ~189KB bundle, runs locally

**Current Stats:**
- 27 tools exposed to Claude
- 10 context types (directives, decisions, patterns, etc.)
- Sub-second semantic search on 10k+ memories
- Works with Claude Desktop, Claude Code, any MCP client

**Example Use Case:**
I'm building an e-commerce platform. I told Claude once: "We use Tailwind, prefer composition API, API rate limit is 1000/min." Now every conversation, Claude remembers and applies these preferences automatically.

**What's Next (v1.6.0 in progress):**
- CI/CD pipeline with GitHub Actions
- Docker support for easy deployment
- Proper test suite with Vitest
- Better error messages and logging

**Try it:**
```bash
npm install -g @joseairosa/recall
# Add to claude_desktop_config.json
# Start using persistent memory
```

GitHub: https://github.com/joseairosa/recall
npm: https://www.npmjs.com/package/@joseairosa/recall

Happy to answer any questions about the architecture, MCP integration, or how it's helped my workflow!

---

**Why I built this:**
I kept hitting Claude's context limits on complex projects. Manually maintaining context.md files was tedious and Claude couldn't search them semantically. I wanted Claude to remember things the way I do – by importance and relevance, not just recency.

The MCP protocol made this possible. It's like giving Claude a Redis-backed brain that persists across sessions.

Would love feedback on the architecture, features you'd want, or your own context management struggles!
```

---

## 🐦 Twitter/X - Launch Thread

### Tweet 1 (Hook)
```
Claude keeps forgetting your project context?

I built Recall – a Redis-backed memory system that gives Claude perfect recall across sessions.

No more re-explaining your architecture every conversation 🧠

Thread 🧵
```

### Tweet 2 (Problem)
```
The problem with LLM conversations:

- Hit context limit → lose everything
- Start new session → explain from scratch
- Complex project → repeat yourself constantly

I was spending 20% of my time just reminding Claude what we already discussed.
```

### Tweet 3 (Solution)
```
Recall solves this with persistent memory:

✅ Claude stores important context as "memories"
✅ Semantic search retrieves relevant info
✅ Works across sessions, projects, machines
✅ Automatic context injection

Think: Redis + embeddings + MCP = Claude with long-term memory
```

### Tweet 4 (Features - with bullets)
```
Key features:

🌍 Global memories - share context across all projects
🔗 Relationships - build knowledge graphs
📚 Versioning - track memory evolution
📋 Templates - reusable workflows
🔒 Workspace isolation - clean separation

27 tools, 10k+ memories, sub-second search
```

### Tweet 5 (Demo - attach GIF/video)
```
Watch it in action:

[DEMO GIF showing: storing a memory, searching, retrieval in next session]

Claude remembers "We use Tailwind + Vue 3" from last week and applies it automatically.

No manual context management needed.
```

### Tweet 6 (Technical)
```
How it works:

1. Claude calls `store_memory` tool during conversation
2. Content → OpenAI embeddings → Redis
3. On retrieval: semantic search via cosine similarity
4. Returns top-K relevant memories to Claude

Tech: TypeScript + Redis + MCP protocol + OpenAI API
```

### Tweet 7 (Use Cases)
```
Perfect for:

👨‍💻 Long-term coding projects
🏢 Team knowledge sharing (cloud Redis)
📖 Documentation that evolves
🎯 Project-specific preferences
🧩 Complex multi-session work

Basically: any time you need Claude to remember past context
```

### Tweet 8 (Stats)
```
What you get:

• 27 MCP tools for memory management
• Semantic search on 10k+ memories
• Automatic workspace isolation
• Global cross-project sharing
• Knowledge graph relationships
• Version history with rollback

All open source, MIT licensed
```

### Tweet 9 (Getting Started)
```
Get started in 3 steps:

1. npm install -g @joseairosa/recall
2. Add to claude_desktop_config.json
3. Start conversation: "Remember: we use TypeScript strict mode"

That's it. Claude now has persistent memory.

Full setup: [link to README]
```

### Tweet 10 (CTA)
```
Building v1.6.0 now:
• CI/CD pipeline
• Docker support
• Proper test suite
• Better DX

⭐ Star on GitHub: [link]
📦 Try on npm: [link]
💬 Questions? Reply below!

Would love your feedback on what to build next 🚀
```

### Tweet 11 (Credit/Tags)
```
Built with the MCP (Model Context Protocol) from @AnthropicAI

Makes it incredibly easy to extend Claude with custom tools and persistent state.

If you're building with Claude, check out MCP – it's a game changer.

#ClaudeAI #MCP #AI #OpenSource
```

---

## 🚀 Product Hunt

### Tagline
```
Persistent memory for Claude – remember everything across sessions
```

### Description
```
Recall gives Claude long-term memory that survives context limits and session restarts.

🧠 THE PROBLEM
Claude starts every conversation from scratch. Hit the context limit? Lose everything. Need to remind Claude about your project setup, coding standards, and past decisions every single time.

💡 THE SOLUTION
Recall is an MCP server that stores important context in Redis with semantic search. Claude can now remember and retrieve relevant information across sessions, projects, and even machines.

✨ KEY FEATURES
• Semantic Search - Find memories by meaning, not keywords
• Global Memories - Share context across all your projects
• Knowledge Graphs - Link related memories together
• Version History - Track how memories evolve over time
• Workspace Isolation - Clean separation between projects
• Templates - Reusable patterns for common workflows

🔧 HOW IT WORKS
1. During conversations, Claude stores important context as "memories"
2. Content is embedded (OpenAI) and stored in Redis with metadata
3. Semantic search retrieves relevant memories automatically
4. Works across sessions, projects, machines (with cloud Redis)

⚡ PERFORMANCE
• Sub-second search on 10,000+ memories
• 189KB bundle size
• Runs locally, no cloud dependencies (except OpenAI for embeddings)

🛠️ TECH STACK
TypeScript + Redis + MCP Protocol + OpenAI Embeddings

📦 GET STARTED
```bash
npm install -g @joseairosa/recall
```

Add to Claude Desktop config, start remembering.

Perfect for:
- Long-term coding projects
- Team knowledge sharing
- Complex multi-session work
- Project-specific preferences

Open source (MIT), actively maintained, production-ready.
```

### First Comment (Post when launched)
```
Hey Product Hunt! 👋

I'm José, creator of Recall.

I built this because I was spending 20% of my Claude conversations just re-explaining context. "We use Tailwind." "API limit is 1000/min." "Prefer composition API." Every. Single. Session.

Recall fixes this. Now Claude just... remembers.

The breakthrough was using the MCP (Model Context Protocol) from Anthropic. It lets you extend Claude with custom tools. I added 27 tools for memory management – store, search, link, version, etc.

**Real example from my workflow:**
Building an e-commerce platform across 50+ conversations. Claude now remembers our architecture, coding standards, past decisions. I haven't repeated myself in weeks.

**What I'm most proud of:**
- Semantic search that actually works (OpenAI embeddings + cosine similarity)
- Zero context pollution between projects (workspace isolation)
- Knowledge graphs (v1.4.0) – memories can reference each other
- Version history (v1.5.0) – see how understanding evolved

**What's next:**
v1.6.0 drops next week with CI/CD, Docker support, and proper testing framework.

Would love your feedback! What would you use this for? What features should I build next?

Happy to answer any questions about the tech, architecture, or MCP integration 🚀
```

---

## 📝 Reddit Posts

### r/ClaudeAI

**Title:**
```
[Tool] I built Recall – give Claude persistent memory with Redis
```

**Post:**
```
Hey r/ClaudeAI!

I created an MCP server called Recall that solves the context loss problem we all face.

**The Problem:**
Every Claude conversation starts from scratch. Hit the context limit or start a new session? You're back to explaining your project setup, preferences, past decisions.

**The Solution:**
Recall gives Claude persistent memory using Redis + semantic search. Think of it as long-term memory that survives context limits.

**Demo:**
[Upload demo GIF/video showing memory storage and retrieval]

**How It Works:**
- Claude stores important context as "memories" during conversations
- Content is embedded and stored in Redis with metadata
- Semantic search retrieves relevant memories automatically
- Works across sessions, projects, machines

**Features:**
- 🌍 Global memories (share context across all projects)
- 🔗 Relationships (link related memories)
- 📚 Version history (track changes)
- 📋 Templates (reusable patterns)
- 🔒 Workspace isolation (per-project memories)

**Real Example:**
I'm building an e-commerce platform. I told Claude once: "We use Tailwind, Vue 3 Composition API, Pinia for state." Now every conversation applies these preferences automatically.

**Get Started:**
```bash
npm install -g @joseairosa/recall
```

Add to your `claude_desktop_config.json` and you're done.

**GitHub:** https://github.com/joseairosa/recall
**npm:** https://www.npmjs.com/package/@joseairosa/recall

Open source (MIT), actively maintained. Currently at v1.5.0, v1.6.0 coming soon with Docker support.

Happy to answer questions! Would love feedback on what features to build next.
```

---

### r/LocalLLaMA

**Title:**
```
Built a Redis-backed memory system for LLMs (Claude) with semantic search
```

**Post:**
```
Hey r/LocalLLaMA!

I built Recall – a persistent memory system for LLMs using Redis + embeddings.

**Architecture:**
- TypeScript MCP server
- Redis for storage (supports local or cloud)
- OpenAI embeddings (text-embedding-3-small)
- Cosine similarity for semantic search
- ~189KB bundle

**Why This Matters:**
LLMs have context limits. Long conversations → information loss. Recall gives them persistent memory that survives sessions.

**Technical Details:**
- 27 tools exposed via MCP protocol
- Automatic workspace isolation (project A ≠ project B)
- Global memory scope for cross-project sharing
- Knowledge graph relationships (v1.4.0)
- Version history with rollback (v1.5.0)

**Performance:**
- Sub-second search on 10k+ memories
- Efficient Redis indexing (sorted sets, hash maps)
- Batch embedding generation
- O(n) similarity search (considering RediSearch for O(log n))

**Future Plans:**
- Replace in-app cosine similarity with RediSearch vector similarity
- Add local embedding options (no OpenAI dependency)
- Support other LLM providers (not just Claude)
- REST API for non-MCP clients

**Code:**
GitHub: https://github.com/joseairosa/recall

Open source (MIT). TypeScript source available.

Would love technical feedback on the architecture! Especially interested in:
- Better embedding strategies
- Scaling to 100k+ memories
- Local embedding alternatives
- Memory consolidation algorithms

Let me know what you think!
```

---

### r/SelfHosted

**Title:**
```
Recall – Self-hosted persistent memory for Claude AI with Redis
```

**Post:**
```
Hey r/SelfHosted!

Built a self-hosted memory system for Claude AI that I thought you'd appreciate.

**What It Does:**
Gives Claude persistent memory across sessions using Redis. All data stays on your infrastructure.

**Self-Hosting Setup:**
```bash
# Option 1: Docker (v1.6.0 - coming soon)
docker-compose up -d

# Option 2: Local Redis
redis-server &
npm install -g @joseairosa/recall
# Configure in claude_desktop_config.json
```

**Architecture:**
- Node.js MCP server (runs locally)
- Redis for storage (your choice of deployment)
- OpenAI API for embeddings (only outbound call)
- All conversation data stored in YOUR Redis

**Privacy:**
✅ All memories stored locally (or your cloud Redis)
✅ No data sent to third parties except OpenAI for embeddings
✅ Full control over data retention
✅ Can use Upstash, Redis Cloud, or self-hosted Redis

**Use Cases:**
- Personal knowledge base
- Team wikis (shared Redis instance)
- Project documentation
- Cross-session context for AI conversations

**Requirements:**
- Node.js 18+
- Redis 6+
- OpenAI API key (for embeddings)

**GitHub:** https://github.com/joseairosa/recall
**npm:** https://www.npmjs.com/package/@joseairosa/recall

Docker support coming in v1.6.0 next week!

Questions about self-hosting setup? Ask away!
```

---

## 📰 Dev.to Article

**Title:**
```
Building a Persistent Memory System for LLMs with Redis and Embeddings
```

**Tags:**
```
#ai #redis #typescript #openai
```

**Article:** (Summary - full article would be 1500-2000 words)

```markdown
# Building a Persistent Memory System for LLMs with Redis and Embeddings

## The Problem

Large Language Models like Claude are incredibly powerful, but they have a critical limitation: they forget everything between sessions...

## The Solution Architecture

### 1. Storage Layer (Redis)
- Memory entries as Redis hashes
- Sorted sets for indexing by timestamp, importance
- Workspace isolation via key prefixes
- Efficient retrieval patterns

### 2. Semantic Search (Embeddings)
- OpenAI text-embedding-3-small (1536 dimensions)
- Cosine similarity for relevance ranking
- In-memory search (considering RediSearch migration)

### 3. Integration (MCP Protocol)
- 27 tools exposed to Claude
- Automatic workspace detection
- Global vs. local memory scopes

## Key Technical Decisions

### Why Redis?
- Fast key-value access
- Rich data structures (sets, sorted sets, hashes)
- Pub/sub for future real-time features
- Proven scalability

### Why OpenAI Embeddings?
- High quality semantic representations
- 1536 dimensions (good balance)
- Affordable ($0.0001 per 1k tokens)
- Easy to swap later

### Why MCP?
- Native Claude integration
- Tool-based interaction model
- Standardized protocol
- Easy to extend

## Implementation Highlights

[Code snippets showing:
- Memory storage
- Semantic search
- Redis indexing
- MCP tool handlers]

## Performance Characteristics

- Sub-second search on 10k memories
- Linear scaling with memory count (O(n) search)
- ~2KB per memory (content + embedding + metadata)
- 189KB bundle size

## Lessons Learned

1. Embeddings are expensive – cache everything
2. Workspace isolation is critical
3. Semantic search beats keyword search
4. Version history is essential for trust

## What's Next

- RediSearch for vector similarity (O(log n))
- Local embedding options
- Multi-user support
- REST API

## Try It Yourself

[Installation instructions]

## Conclusion

Building persistent memory for LLMs isn't just about storage – it's about making that memory *useful* through semantic search and smart retrieval...
```

---

## 📺 YouTube - Video Scripts

### Video 1: "Give Claude Long-Term Memory in 5 Minutes"

**Script:**
```
[0:00 - Hook]
"Claude keeps forgetting your project context? Let me show you how to give Claude perfect memory that lasts forever. This is Recall."

[0:10 - Problem Demo]
"Here's the problem. I'm talking to Claude about my project. I explain we use Tailwind, Vue 3, Pinia. Claude understands perfectly."
[Show conversation]
"But now I start a new conversation..."
[New session]
"Claude has no idea what I'm talking about. I have to explain everything again."

[0:30 - Solution Intro]
"That's where Recall comes in. It's like giving Claude a Redis-backed brain that remembers everything across sessions."

[0:40 - Installation]
"Installation takes 2 minutes."
[Screen recording of npm install]
"Add it to your Claude Desktop config..."
[Show config file]

[1:00 - Demo]
"Now watch this. I tell Claude to remember something."
[Show: "Remember: we use Tailwind for styling"]
"Claude stores it in Redis."
[Show Redis keys being created]

[1:15 - Retrieval]
"New conversation. I ask about styling."
[Show Claude retrieving the memory and responding correctly]
"It just remembered. Without me having to repeat anything."

[1:30 - Features]
"And it's not just simple memory. You get:"
- Semantic search (show searching for related concepts)
- Global memories (show cross-project sharing)
- Knowledge graphs (show linked memories)
- Version history (show memory evolution)

[2:00 - Use Cases]
"This is perfect for:"
- Long coding projects
- Team knowledge bases
- Complex multi-session work
- Any time you need Claude to remember context

[2:15 - Outro]
"It's open source, MIT licensed, actively maintained."
"Link in description. Give Claude perfect memory today."
[End screen with GitHub link]
```

---

## 📧 Email Newsletter (if applicable)

**Subject:**
```
Introducing Recall – Persistent Memory for Claude AI
```

**Body:**
```
Hi [Name],

I just launched Recall – a tool that gives Claude AI persistent memory across sessions.

**The Problem You Know:**
Every Claude conversation starts from scratch. You spend time re-explaining your project setup, coding preferences, and past decisions.

**The Solution:**
Recall stores important context in Redis with semantic search. Claude can now remember and retrieve information across sessions automatically.

**What You Get:**
✓ Persistent memory that survives context limits
✓ Semantic search for intelligent retrieval
✓ Workspace isolation (project separation)
✓ Global memories (cross-project sharing)
✓ Knowledge graphs and version history

**Get Started:**
npm install -g @joseairosa/recall

Add to Claude Desktop config → Done.

Try it free: https://github.com/joseairosa/recall

Would love your feedback!

José
```

---

## 💬 Discord/Slack Communities

**Short Version:**
```
Hey folks! 👋

Just launched Recall – gives Claude persistent memory with Redis.

Problem: Claude forgets everything between sessions
Solution: Semantic search + Redis = long-term memory

Features:
- Remember context across sessions
- Semantic search (embeddings)
- Workspace isolation
- Knowledge graphs

npm: @joseairosa/recall
GitHub: https://github.com/joseairosa/recall

Open source, MIT licensed. Would love feedback! 🚀
```

---

## 📊 Analytics Tags

**For tracking launch effectiveness:**

```
UTM parameters:
- utm_source=hackernews (or twitter, reddit, etc.)
- utm_medium=social
- utm_campaign=launch_v1_5

Example:
https://github.com/joseairosa/recall?utm_source=hackernews&utm_medium=social&utm_campaign=launch_v1_5
```

---

**All content ready to copy/paste! Which platform would you like to launch on first, José?**

I recommend: **Hacker News on a Tuesday or Wednesday morning** for maximum visibility. 🚀
