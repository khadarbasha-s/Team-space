import {
  MessageCircle,
  Building2,
  Video,
  ScreenShare,
  FolderOpen,
  CalendarDays,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

// Single source of truth for every service: the short teaser used on the
// landing page cards and nav dropdown, plus the longer copy used on each
// service's own detail page (/services/:slug).
export const SERVICES = [
  {
    slug: "team-chat",
    icon: MessageCircle,
    title: "Team Chat",
    tag: "Real-time",
    description:
      "Real-time messaging inside channels, over WebSockets. Every message is persisted to Postgres and loaded as history the moment you open a channel.",
    detail: {
      eyebrow: "Chat",
      heading: "Conversations that never miss a beat.",
      intro:
        "Chat is the center of every channel in TeamSpace -- live, persistent, and scoped to exactly the people who should see it.",
      features: [
        {
          title: "Instant delivery",
          body: "Messages travel over a live WebSocket connection, so everyone already in the channel sees a new message the moment it's sent -- no polling, no refresh, no delay.",
        },
        {
          title: "Full history, always",
          body: "Every message is written straight to Postgres as it arrives. Close the tab, come back next week, and the entire conversation is still right where you left it.",
        },
        {
          title: "Scoped to the right people",
          body: "Chat lives inside a channel, which lives inside a team, which lives inside your organization. Nobody outside that chain can see a single message.",
        },
      ],
    },
  },
  {
    slug: "organizations-teams",
    icon: Building2,
    title: "Organizations & Teams",
    tag: "Multi-tenant",
    description:
      "Spin up your own organization or join an existing one by its slug, then create teams and channels inside it. Every layer -- org, team, channel -- is access-controlled.",
    detail: {
      eyebrow: "Structure",
      heading: "A workspace shaped like your company.",
      intro:
        "TeamSpace is multi-tenant from the ground up: your organization is a private tenant, teams are the groups inside it, and channels are where the actual work happens.",
      features: [
        {
          title: "Create or join in a minute",
          body: "Start a brand-new organization with just a name, or join an existing one by typing its slug -- no admin approval flow to wait on.",
        },
        {
          title: "Teams for how you're actually organized",
          body: "Engineering, Sales, Design -- create as many teams as you need inside your organization, each with its own members and channels.",
        },
        {
          title: "Access-controlled at every layer",
          body: "Membership is checked at the organization, team, and channel level on every request, so people only ever see the parts of the workspace they actually belong to.",
        },
      ],
    },
  },
  {
    slug: "video-calls",
    icon: Video,
    title: "Group Video Calls",
    tag: "HD video",
    description:
      "Start a video call from any channel. Everyone who joins publishes camera and mic and sees a live tile for every other participant, powered by WebRTC (LiveKit).",
    detail: {
      eyebrow: "Video",
      heading: "Face-to-face, straight from the channel you're already in.",
      intro:
        "No separate meeting app, no link to copy -- start a call from inside any channel and everyone there can join in one click.",
      features: [
        {
          title: "Real WebRTC, not a mockup",
          body: "Calls run on LiveKit, a production-grade WebRTC media server, so camera and audio are peer-quality and built to handle multiple participants smoothly.",
        },
        {
          title: "A live tile for everyone",
          body: "Every participant who joins publishes their camera and mic and immediately appears as a tile for everyone else on the call -- no manual refresh needed.",
        },
        {
          title: "Tied to the channel it started in",
          body: "A call belongs to the channel it was started from, so it inherits the same access control as the chat around it -- only channel members can join.",
        },
      ],
    },
  },
  {
    slug: "screen-sharing",
    icon: ScreenShare,
    title: "Screen Sharing",
    tag: "One click",
    description:
      "Share your screen mid-call and it shows up as a distinctly-bordered tile for everyone else, alongside -- not replacing -- the camera tiles.",
    detail: {
      eyebrow: "Screen share",
      heading: "Show your screen without losing the room.",
      intro:
        "Screen sharing adds to the call instead of taking it over -- your screen shows up next to everyone's camera, not instead of it.",
      features: [
        {
          title: "Share in one click, mid-call",
          body: "Start sharing your screen at any point during a video call, no need to restart the call or lose your current participants.",
        },
        {
          title: "Clearly marked, never confused with a camera",
          body: "A shared screen renders as its own distinctly-bordered tile, so it's immediately obvious to everyone which tile is a screen and which is a face.",
        },
        {
          title: "Camera tiles stay put",
          body: "Sharing your screen doesn't bump anyone's camera tile off the call -- everyone keeps seeing everyone, plus the shared screen.",
        },
      ],
    },
  },
  {
    slug: "file-sharing",
    icon: FolderOpen,
    title: "File Sharing",
    tag: "Any file",
    description:
      "Upload a file from any channel's Files tab. It's stored, recorded, and instantly downloadable by anyone else who can see that channel.",
    detail: {
      eyebrow: "Files",
      heading: "Every file, right where the conversation happened.",
      intro:
        "Files live inside the channel they were shared in, in a dedicated Files tab, instead of getting buried in a chat scrollback.",
      features: [
        {
          title: "Upload from any channel",
          body: "Drop a file into a channel's Files tab and it's uploaded and stored immediately, no separate file-sharing tool required.",
        },
        {
          title: "Downloadable by anyone in the channel",
          body: "Once uploaded, a file is instantly available for anyone with access to that channel to open or download.",
        },
        {
          title: "A record of what was shared, and by whom",
          body: "Every upload is recorded against the channel, so there's a running, browsable history of what's been shared and when.",
        },
      ],
    },
  },
  {
    slug: "calendar",
    icon: CalendarDays,
    title: "Team Calendar",
    tag: "Shared",
    description:
      "Schedule events for your team -- title, description, start and end time -- visible to every member, with deletion limited to the person who created it.",
    detail: {
      eyebrow: "Calendar",
      heading: "One shared calendar your whole team actually sees.",
      intro:
        "A straightforward, shared calendar for your team -- no separate calendar app to connect, no invites to manage by hand.",
      features: [
        {
          title: "Simple events that cover what matters",
          body: "Give an event a title, a description, and a start and end time -- enough structure to keep everyone aligned without unnecessary complexity.",
        },
        {
          title: "Visible to the whole team",
          body: "Once created, an event is visible to every member of the team it belongs to, so there's one shared source of truth for what's scheduled.",
        },
        {
          title: "Deletion limited to the creator",
          body: "Only the person who created an event can delete it, which keeps the calendar from being accidentally cleared out by someone else on the team.",
        },
      ],
    },
  },
  {
    slug: "ai-recap",
    icon: Sparkles,
    title: "AI Channel Recap",
    tag: "AI-powered",
    description:
      "Jump into any channel's AI Recap tab for a quick-read summary: a message/participant count, the top keywords, and the handful of messages that carry the real signal.",
    detail: {
      eyebrow: "AI recap",
      heading: "Catch up on a busy channel in seconds.",
      intro:
        "Instead of scrolling back through hundreds of messages, open a channel's AI Recap tab for a quick, structured summary of what's been happening.",
      features: [
        {
          title: "At-a-glance activity stats",
          body: "See the message count and participant count for the channel immediately, so you know how busy it's been before you dive in.",
        },
        {
          title: "Top keywords, surfaced automatically",
          body: "The recap pulls out the keywords that come up most, giving you a quick sense of what the channel has actually been talking about.",
        },
        {
          title: "The messages that carry the real signal",
          body: "Rather than a generic summary, the recap highlights the handful of messages most likely to matter, so you can go straight to the source.",
        },
      ],
    },
  },
  {
    slug: "security",
    icon: ShieldCheck,
    title: "Enterprise Security",
    tag: "Built-in",
    description:
      "Every request -- chat, video, files, calendar, recap -- is scoped to your organization. Data from another org never leaks, not even as a hint that it exists.",
    detail: {
      eyebrow: "Security",
      heading: "Tenant isolation, built into every request.",
      intro:
        "Every feature in TeamSpace -- chat, video, files, calendar, recap -- is checked against your organization on every single request, not just at login.",
      features: [
        {
          title: "Organization-scoped by default",
          body: "Every request carries the context of your organization, and every query is filtered by it -- there's no code path that can accidentally cross organizations.",
        },
        {
          title: "No leakage, not even a hint",
          body: "Data belonging to another organization isn't just hidden -- it's excluded entirely, so there's no way to infer that it exists from timing, errors, or counts.",
        },
        {
          title: "Consistent across every feature",
          body: "The same isolation guarantee applies everywhere: chat, calls, files, calendar, and recap all enforce it the same way, rather than each feature handling it differently.",
        },
      ],
    },
  },
];

export function getServiceBySlug(slug) {
  return SERVICES.find((service) => service.slug === slug);
}
