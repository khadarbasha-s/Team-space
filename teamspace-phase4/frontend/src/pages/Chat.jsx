import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pin, Smile, Pencil, Trash2, Reply, Mic, Video, Languages, X, Users, Info, Paperclip, Phone, FileText, SendHorizontal, Image as ImageIcon, Camera, Headphones, User as UserIcon, BarChart3, CalendarDays, Sticker as StickerIcon } from "lucide-react";
import { api, WS_BASE, getToken, ORG_SUSPENDED_EVENT } from "../api";
import { useAuth } from "../auth";
import { usePresence } from "../presence";
import { useCall } from "../call";
import FilesPanel from "../FilesPanel";
import RecapPanel from "../RecapPanel";
import Shell from "../Shell";
import { ROLE_LABELS, roleBadgeClass } from "../roles";
import Avatar from "../components/Avatar";
import ProfileModal from "../components/ProfileModal";
import TeamMembersModal from "../components/TeamMembersModal";
import AttachmentView, { humanSize } from "../components/AttachmentView";
import { PollCard, ContactCard, EventCard } from "../components/ChatCards";
import { CameraModal, PollModal, ContactModal, EventModal, StickerModal } from "../components/ComposerModals";

const COMPOSER_EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","😉","😍","🥰","😘","😋",
  "😎","🤩","🥳","🤔","🤗","😴","😢","😭","😡","🤯","😱","🙄","😬","🤝","👍","👎",
  "👏","🙌","🙏","💪","👋","✌️","🤞","👌","❤️","🧡","💛","💚","💙","💜","🔥","✨",
  "🎉","🎂","🚀","💡","✅","❌","⭐","📌","📎","📅","💻","☕",
];
const QUICK_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}", "\u{1F62E}", "\u{1F622}"];
const TYPING_TIMEOUT_MS = 4000;
const TYPING_SEND_THROTTLE_MS = 2000;

export default function Chat() {
  const { user } = useAuth();
  const { presence } = usePresence();
  const { startCall, joinCall, active: activeCall, liveCalls } = useCall();
  const [searchParams, setSearchParams] = useSearchParams();

  const [teams, setTeams] = useState([]);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [channelsByTeam, setChannelsByTeam] = useState({});
  const [selected, setSelected] = useState(null); // { teamId, channelId, teamName, channelName }

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [error, setError] = useState("");
  const [callChannelId, setCallChannelId] = useState(null);
  const [view, setView] = useState("messages"); // "messages" | "pinned" | "files" | "recap"
  const [teamQuery, setTeamQuery] = useState("");
  const [sideTab, setSideTab] = useState("teams"); // "teams" (my teams) | "people" | "leads" | "groups"
  const [groups, setGroups] = useState([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPick, setGroupPick] = useState([]); // user ids chosen for a new group / being added
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);
  const [pickQuery, setPickQuery] = useState("");
  const [profileFor, setProfileFor] = useState(null); // user id whose profile card is open
  const [teamModal, setTeamModal] = useState(null); // { id, name } -- team whose people dialog is open
  const [sideNotice, setSideNotice] = useState("");
  const [pendingFile, setPendingFile] = useState(null); // file staged to send with the next message
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [dragging, setDragging] = useState(false);
  const attachInputRef = useRef(null); // documents
  const mediaInputRef = useRef(null); // photos & videos
  const audioInputRef = useRef(null); // audio files
  const [composerModal, setComposerModal] = useState(null); // camera | poll | contact | event | sticker
  const draftInputRef = useRef(null);
  const composerWrapRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Close the emoji / attach popovers on outside click or Escape.
  useEffect(() => {
    if (!showEmoji && !showAttachMenu) return undefined;
    function onDown(e) {
      if (composerWrapRef.current && !composerWrapRef.current.contains(e.target)) {
        setShowEmoji(false);
        setShowAttachMenu(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setShowEmoji(false);
        setShowAttachMenu(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showEmoji, showAttachMenu]);

  function insertEmoji(em) {
    const el = draftInputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + em + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + em.length, start + em.length);
    });
  }
  const [people, setPeople] = useState([]); // teammates (share a team with me)
  const [leads, setLeads] = useState([]); // admins, managers, team leads
  const [showOtherTeams, setShowOtherTeams] = useState(false);

  // -- Phase 1 chat UX state --
  const [teamMembers, setTeamMembers] = useState([]); // [{id, name}] for the selected team -- mentions
  const [replyTo, setReplyTo] = useState(null); // message being replied to
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // user_id -> name
  const [reads, setReads] = useState([]); // [{user_id, user_name, last_read_at}]
  const [unreadCounts, setUnreadCounts] = useState({}); // channel_id -> count
  const [mentionQuery, setMentionQuery] = useState(null); // string while "@..." is being typed, else null
  const [translateFor, setTranslateFor] = useState(null); // message id currently showing the translate stub
  const [recording, setRecording] = useState(null); // "audio" | "video" | null
  const [recordError, setRecordError] = useState("");

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimersRef = useRef({}); // user_id -> timeout handle
  const lastTypingSentRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);

  async function loadTeams() {
    const { data } = await api.get("/teams");
    setTeams(data);
    return data;
  }

  async function loadUnreadCounts() {
    try {
      const { data } = await api.get("/unread-counts");
      const map = {};
      for (const row of data) map[row.channel_id] = row.unread_count;
      setUnreadCounts(map);
    } catch {
      // Not fatal -- badges just stay stale until the next poll.
    }
  }

  async function loadPeople() {
    try {
      const [{ data: mates }, { data: lead }, { data: grp }] = await Promise.all([
        api.get("/people"),
        api.get("/people/leadership"),
        api.get("/groups"),
      ]);
      setPeople(mates);
      setLeads(lead);
      setGroups(grp);
      return { mates, lead, grp };
    } catch {
      return { mates: [], lead: [], grp: [] };
    }
  }

  // On first load, if the URL has ?team=&channel= (from a previous visit or
  // a reload), restore that channel instead of leaving the view empty.
  useEffect(() => {
    (async () => {
      const teamsData = await loadTeams();
      const { mates, lead, grp } = await loadPeople();
      loadUnreadCounts();
      const groupId = searchParams.get("group");
      if (groupId) {
        const g = grp.find((x) => x.channel_id === groupId);
        if (g) {
          setSideTab("groups");
          setSelected({ teamId: null, channelId: g.channel_id, teamName: g.name, channelName: null, isGroup: true, createdBy: g.created_by, memberCount: g.members.length });
        }
        return;
      }
      const dmId = searchParams.get("dm");
      if (dmId) {
        const person = [...mates, ...lead].find((p) => p.dm_channel_id === dmId);
        if (person) {
          setSideTab(lead.some((p) => p.id === person.id) && !mates.some((p) => p.id === person.id) ? "leads" : "people");
          setSelected({ teamId: null, channelId: dmId, teamName: person.name, channelName: null, isDirect: true, personId: person.id, role: person.org_role });
        }
        return;
      }
      const teamId = searchParams.get("team");
      const channelId = searchParams.get("channel");
      if (!teamId || !channelId) return;
      const team = teamsData.find((t) => t.id === teamId);
      if (!team || !team.is_member) return;
      try {
        const { data: channels } = await api.get(`/teams/${team.id}/channels`);
        setChannelsByTeam((prev) => ({ ...prev, [team.id]: channels }));
        const channel = channels.find((c) => c.id === channelId);
        if (!channel) return;
        setExpandedTeamId(team.id);
        setSelected({ teamId: team.id, channelId: channel.id, teamName: team.name, channelName: channel.name });
      } catch {
        // Channel may have been deleted or access revoked since the last
        // visit -- just fall back to the empty state.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread badges can change from activity in channels the user isn't
  // currently viewing -- poll the same way NotificationBell does, rather
  // than standing up a second always-on websocket just for counts.
  useEffect(() => {
    const id = setInterval(loadUnreadCounts, 60000); // fallback only -- pushes below are instant
    return () => clearInterval(id);
  }, []);

  // Instant unread badges: the presence socket pushes "new_message" the moment
  // someone posts in a channel/conversation I'm part of (see presence.jsx).
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const knownConvoRef = useRef(new Set());
  knownConvoRef.current = new Set([
    ...people.map((p) => p.dm_channel_id).filter(Boolean),
    ...leads.map((p) => p.dm_channel_id).filter(Boolean),
    ...groups.map((g) => g.channel_id),
  ]);
  useEffect(() => {
    function onPush(e) {
      const d = e.detail;
      if (d.type === "team_added" || d.type === "team_removed") {
        loadTeams();
        setChannelsByTeam((prev) => {
          const { [d.team_id]: _gone, ...rest } = prev;
          return rest; // reload that team's channels next time it's opened
        });
        setSideNotice(d.type === "team_added" ? `You were added to ${d.team_name}${d.by ? ` by ${d.by}` : ""}.` : `You were removed from ${d.team_name}.`);
        setTimeout(() => setSideNotice(""), 6000);
        return;
      }
      if (d.type === "conversation_added") {
        loadPeople();
        return;
      }
      if (d.type !== "new_message") return;
      if (d.channel_id !== selectedRef.current?.channelId) {
        setUnreadCounts((prev) => ({ ...prev, [d.channel_id]: (prev[d.channel_id] || 0) + 1 }));
      }
      // A conversation we haven't seen yet (someone just messaged us for the
      // first time) -- refresh the lists so its row appears.
      if (d.is_conversation && !knownConvoRef.current.has(d.channel_id)) loadPeople();
    }
    window.addEventListener("teamspace:push", onPush);
    return () => window.removeEventListener("teamspace:push", onPush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTeam(team) {
    if (expandedTeamId === team.id) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(team.id);
    if (team.is_member && !channelsByTeam[team.id]) {
      const { data } = await api.get(`/teams/${team.id}/channels`);
      setChannelsByTeam((prev) => ({ ...prev, [team.id]: data }));
    }
  }

  async function createTeam(e) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setError("");
    try {
      await api.post("/teams", { name: newTeamName.trim() });
      setNewTeamName("");
      await loadTeams();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create team.");
    }
  }

  async function joinTeam(team) {
    await api.post(`/teams/${team.id}/join`);
    await loadTeams();
    const { data } = await api.get(`/teams/${team.id}/channels`);
    setChannelsByTeam((prev) => ({ ...prev, [team.id]: data }));
    setExpandedTeamId(team.id);
  }

  async function createChannel(e, team) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setError("");
    try {
      await api.post(`/teams/${team.id}/channels`, { name: newChannelName.trim() });
      setNewChannelName("");
      const { data } = await api.get(`/teams/${team.id}/channels`);
      setChannelsByTeam((prev) => ({ ...prev, [team.id]: data }));
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create channel.");
    }
  }

  async function openDirect(person) {
    setError("");
    try {
      const { data } = await api.post("/dm", { user_id: person.id });
      setCallChannelId(null);
      setView("messages");
      setReplyTo(null);
      setEditingId(null);
      setSelected({ teamId: null, channelId: data.channel_id, teamName: data.name, channelName: null, isDirect: true, personId: data.user_id, role: data.org_role });
      setSearchParams({ dm: data.channel_id });
      const patch = (list) => list.map((p) => (p.id === person.id ? { ...p, dm_channel_id: data.channel_id } : p));
      setPeople(patch);
      setLeads(patch);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not open that conversation.");
    }
  }

  function openGroup(group) {
    setCallChannelId(null);
    setView("messages");
    setReplyTo(null);
    setEditingId(null);
    setSelected({ teamId: null, channelId: group.channel_id, teamName: group.name, channelName: null, isGroup: true, createdBy: group.created_by, memberCount: group.members.length });
    setSearchParams({ group: group.channel_id });
  }

  // People who can be picked for a group: teammates + leadership, de-duplicated.
  const candidates = (() => {
    const map = new Map();
    for (const p of [...people, ...leads]) map.set(p.id, p);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  function togglePick(id) {
    setGroupPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createGroup(e) {
    e.preventDefault();
    setGroupBusy(true);
    setGroupError("");
    try {
      const { data } = await api.post("/groups", { name: groupName.trim(), user_ids: groupPick });
      setShowNewGroup(false);
      setGroupName("");
      setGroupPick([]);
      setPickQuery("");
      await loadPeople();
      setSideTab("groups");
      openGroup(data);
    } catch (err) {
      const d = err?.response?.data?.detail;
      setGroupError(typeof d === "string" ? d : "Could not create the group. Pick at least two people and give it a name.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function openGroupInfo() {
    setGroupError("");
    setGroupPick([]);
    setPickQuery("");
    try {
      const { data } = await api.get(`/groups/${selected.channelId}`);
      setGroupInfo(data);
      setShowGroupInfo(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load the group.");
    }
  }

  async function refreshGroupInfo(data) {
    setGroupInfo(data);
    setSelected((prev) => (prev ? { ...prev, teamName: data.name, memberCount: data.members.length } : prev));
    loadPeople();
  }

  async function addToGroup() {
    if (!groupPick.length) return;
    setGroupBusy(true);
    setGroupError("");
    try {
      const { data } = await api.post(`/groups/${groupInfo.channel_id}/members`, { user_ids: groupPick });
      setGroupPick([]);
      await refreshGroupInfo(data);
    } catch (err) {
      setGroupError(err?.response?.data?.detail || "Could not add those people.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function removeFromGroup(userId) {
    setGroupError("");
    try {
      await api.delete(`/groups/${groupInfo.channel_id}/members/${userId}`);
      if (userId === user.id) {
        setShowGroupInfo(false);
        setSelected(null);
        setSearchParams({});
        loadPeople();
        return;
      }
      const { data } = await api.get(`/groups/${groupInfo.channel_id}`);
      await refreshGroupInfo(data);
    } catch (err) {
      setGroupError(err?.response?.data?.detail || "Could not remove that person.");
    }
  }

  async function renameGroup(name) {
    if (!name.trim() || name.trim() === groupInfo.name) return;
    try {
      const { data } = await api.patch(`/groups/${groupInfo.channel_id}`, { name: name.trim() });
      await refreshGroupInfo(data);
    } catch (err) {
      setGroupError(err?.response?.data?.detail || "Could not rename the group.");
    }
  }

  function openChannel(team, channel) {
    setCallChannelId(null);
    setView("messages");
    setReplyTo(null);
    setEditingId(null);
    setSelected({ teamId: team.id, channelId: channel.id, teamName: team.name, channelName: channel.name });
    setSearchParams({ team: team.id, channel: channel.id });
  }

  function markRead() {
    if (!selected) return;
    api.post(`/channels/${selected.channelId}/read`, {}).catch(() => {});
    setUnreadCounts((prev) => ({ ...prev, [selected.channelId]: 0 }));
  }

  function loadReads(channelId) {
    api
      .get(`/channels/${channelId}/reads`)
      .then(({ data }) => setReads(data))
      .catch(() => setReads([]));
  }

  function loadPinned(channelId) {
    api
      .get(`/channels/${channelId}/pinned`)
      .then(({ data }) => setPinnedMessages(data))
      .catch(() => setPinnedMessages([]));
  }

  // Candidate set for @mention autocomplete/highlighting -- same team
  // membership the backend matches mentions against (see
  // routers/messages.py's _team_members).
  useEffect(() => {
    if (!selected?.teamId) {
      setTeamMembers([]);
      return;
    }
    api
      .get(`/teams/${selected.teamId}/members`)
      .then(({ data }) => setTeamMembers(data))
      .catch(() => setTeamMembers([]));
  }, [selected?.teamId]);

  // Load history + open a websocket whenever the selected channel changes.
  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    setMessages([]);
    setReads([]);
    setPinnedMessages([]);
    setTypingUsers({});

    api
      .get(`/channels/${selected.channelId}/messages`)
      .then(({ data }) => {
        if (!cancelled) setMessages(data);
      })
      .catch(() => {
        // A 402 here means the org was suspended between loading the page
        // and opening this channel -- api.js's response interceptor already
        // dispatched ORG_SUSPENDED_EVENT, which will flip the whole screen
        // over to <Suspended />, so there's nothing channel-specific to do
        // here beyond not leaving an unhandled rejection in the console.
      });
    loadReads(selected.channelId);
    loadPinned(selected.channelId);
    markRead();

    if (wsRef.current) {
      wsRef.current.close();
    }
    const ws = new WebSocket(`${WS_BASE}/ws/channels/${selected.channelId}?token=${getToken()}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "typing": {
          if (data.user_id === user?.id) return;
          setTypingUsers((prev) => ({ ...prev, [data.user_id]: data.user_name }));
          clearTimeout(typingTimersRef.current[data.user_id]);
          typingTimersRef.current[data.user_id] = setTimeout(() => {
            setTypingUsers((prev) => {
              const next = { ...prev };
              delete next[data.user_id];
              return next;
            });
          }, TYPING_TIMEOUT_MS);
          return;
        }
        case "message_edited": {
          setMessages((prev) => prev.map((m) => (m.id === data.id ? data : m)));
          return;
        }
        case "message_deleted": {
          setMessages((prev) =>
            prev.map((m) => (m.id === data.id ? { ...m, deleted: true, content: "" } : m))
          );
          return;
        }
        case "poll": {
          setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, poll: data.poll } : m)));
          return;
        }
        case "reaction": {
          setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, reactions: data.reactions } : m)));
          return;
        }
        case "pin": {
          setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, pinned_at: data.pinned_at } : m)));
          loadPinned(selected.channelId);
          return;
        }
        default: {
          setMessages((prev) => [...prev, data]);
          if (data.needs_refresh) {
            // Contact cards: the live copy has no phone number; fetch ours (honours who may see it).
            api.get(`/messages/${data.id}`).then(({ data: full }) => setMessages((prev) => prev.map((m) => (m.id === full.id ? full : m)))).catch(() => {});
          }
          if (data.user_id !== user?.id) markRead();
          return;
        }
      }
    };
    ws.onclose = (event) => {
      // Code 4402 is this app's suspension close code (see app/ws_manager.py
      // / the suspension check in the WebSocket route) -- the org was
      // suspended while this chat connection was open, possibly idle, so no
      // REST call would otherwise have surfaced it. Route it through the
      // same event api.js's 402 interceptor uses, so AuthProvider refreshes
      // /auth/me and the Suspended screen appears without needing a reload.
      if (event.code === 4402) {
        window.dispatchEvent(new CustomEvent(ORG_SUSPENDED_EVENT));
      }
    };
    wsRef.current = ws;

    return () => {
      cancelled = true;
      ws.close();
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.channelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendTyping() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_SEND_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    wsRef.current.send(JSON.stringify({ type: "typing" }));
  }

  function onDraftChange(value) {
    setDraft(value);
    sendTyping();
    const match = value.match(/@([\w ]{0,30})$/);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(name) {
    setDraft((prev) => prev.replace(/@([\w ]{0,30})$/, `@${name} `));
    setMentionQuery(null);
  }

  function stageFile(file) {
    if (!file) return;
    setRecordError("");
    if (file.size > 25 * 1024 * 1024) {
      setRecordError(`"${file.name}" is ${humanSize(file.size)} -- the limit is 25 MB.`);
      return;
    }
    setPendingFile(file);
  }

  async function postAttachment(file, caption) {
    const form = new FormData();
    form.append("upload", file);
    if (caption) form.append("caption", caption);
    if (replyTo) form.append("parent_id", replyTo.id);
    await api.post(`/channels/${selected.channelId}/attachments`, form, {
      onUploadProgress: (ev) => ev.total && setUploadPct(Math.round((ev.loaded / ev.total) * 100)),
    });
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (pendingFile) {
      if (sending) return;
      setSending(true);
      setUploadPct(0);
      setRecordError("");
      try {
        await postAttachment(pendingFile, draft.trim());
        setPendingFile(null);
        setDraft("");
        setReplyTo(null);
        setMentionQuery(null);
      } catch (err) {
        setRecordError(err?.response?.data?.detail || "Could not send that file. Please try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    if (!draft.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ content: draft.trim(), parent_id: replyTo ? replyTo.id : undefined })
    );
    setDraft("");
    setReplyTo(null);
    setMentionQuery(null);
  }

  function startEdit(msg) {
    setEditingId(msg.id);
    setEditDraft(msg.content);
  }

  async function saveEdit(msg) {
    if (!editDraft.trim()) return;
    try {
      await api.patch(`/messages/${msg.id}`, { content: editDraft.trim() });
      setEditingId(null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save that edit.");
    }
  }

  async function deleteMessage(msg) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      await api.delete(`/messages/${msg.id}`);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not delete that message.");
    }
  }

  async function toggleReaction(msg, emoji) {
    setReactionPickerFor(null);
    try {
      await api.post(`/messages/${msg.id}/reactions`, { emoji });
    } catch {
      // The broadcast reconciles state either way -- a failed toggle here
      // just means this click silently didn't take.
    }
  }

  async function votePoll(msg, options) {
    // Optimistic update so the tap feels instant; the broadcast reconciles everyone.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id || !m.poll) return m;
        const votes = m.poll.votes.map((list, i) => {
          const without = list.filter((v) => v.id !== user.id);
          return options.includes(i) ? [...without, { id: user.id, name: user.name }] : without;
        });
        const voters = new Set(votes.flat().map((v) => v.id));
        return { ...m, poll: { ...m.poll, votes, total_voters: voters.size } };
      }),
    );
    try {
      await api.post(`/messages/${msg.id}/vote`, { options });
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not record your vote.");
      api.get(`/messages/${msg.id}`).then(({ data }) => setMessages((prev) => prev.map((m) => (m.id === data.id ? data : m)))).catch(() => {});
    }
  }

  async function togglePin(msg) {
    try {
      if (msg.pinned_at) {
        await api.delete(`/messages/${msg.id}/pin`);
      } else {
        await api.post(`/messages/${msg.id}/pin`);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not update pin.");
    }
  }

  function initials(name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  // Group consecutive messages from the same sender (within a few minutes of
  // each other) into one visual block, and insert a day separator whenever
  // the calendar date changes -- avoids repeating the avatar/name/timestamp
  // chrome on every single line the way a flat message list would.
  function dayLabel(date) {
    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const today = new Date();
    if (isSameDay(date, today)) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function groupMessages(list) {
    const GROUP_WINDOW_MS = 5 * 60 * 1000;
    const groups = [];
    let lastDayKey = null;
    let lastGroup = null;
    for (const m of list) {
      const created = new Date(m.created_at);
      const dayKey = created.toDateString();
      if (dayKey !== lastDayKey) {
        groups.push({ type: "day", key: `day-${dayKey}`, label: dayLabel(created) });
        lastDayKey = dayKey;
        lastGroup = null;
      }
      const prevItem = lastGroup?.items[lastGroup.items.length - 1];
      const canMerge =
        lastGroup &&
        lastGroup.userId === m.user_id &&
        created - new Date(prevItem.created_at) < GROUP_WINDOW_MS;
      if (canMerge) {
        lastGroup.items.push(m);
      } else {
        lastGroup = { type: "group", key: `group-${m.id}`, userId: m.user_id, userName: m.user_name, avatarUrl: m.user_avatar_url, items: [m] };
        groups.push(lastGroup);
      }
    }
    return groups;
  }

  // Wrap "@Full Name" substrings for any known team member in a highlighted
  // span -- same matching rule the backend uses (routers/messages.py's
  // _parse_mentions), just rendered instead of stored.
  const mentionNames = useMemo(
    () => teamMembers.map((m) => m.name).sort((a, b) => b.length - a.length),
    [teamMembers]
  );

  function renderContent(content) {
    if (!content || mentionNames.length === 0) return content;
    const pattern = new RegExp(`@(${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
      parts.push(
        <span className="mention" key={`${match.index}-${match[0]}`}>
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return parts;
  }

  function fakeTranslate(content) {
    // Stub only -- no real translation service is wired up. Shows a clearly
    // labeled placeholder so the UI affordance can be reviewed/wired up to a
    // real provider later without changing where it lives.
    return `[Translated \u2014 demo] ${content.split("").reverse().join("").split(" ").reverse().join(" ")}`;
  }

  async function uploadClip(blob, kind) {
    if (!selected) return;
    const ext = kind === "video" ? "webm" : "webm";
    const file = new File([blob], `clip-${Date.now()}.${ext}`, { type: blob.type });
    try {
      // Posted as a chat message (also listed under Files), so the other
      // person actually sees and can play it in the conversation.
      await postAttachment(file, "");
    } catch (err) {
      setRecordError(err?.response?.data?.detail || "Could not upload that clip.");
    }
  }

  async function startRecording(kind) {
    setRecordError("");
    try {
      const constraints = kind === "video" ? { audio: true, video: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || "video/webm" });
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const discard = discardRecordingRef.current;
        discardRecordingRef.current = false;
        if (blob.size > 0 && !discard) await uploadClip(blob, kind);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(kind);
    } catch {
      setRecordError("Could not access your microphone/camera. Check your browser permissions.");
    }
  }

  function cancelRecording() {
    discardRecordingRef.current = true;
    mediaRecorderRef.current?.stop();
    setRecording(null);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(null);
  }

  function tabUnread(key) {
    const sum = (ids) => ids.reduce((n, id) => n + (id ? unreadCounts[id] || 0 : 0), 0);
    if (key === "people") return sum(people.map((p) => p.dm_channel_id));
    if (key === "leads") return sum(leads.map((p) => p.dm_channel_id));
    if (key === "groups") return sum(groups.map((g) => g.channel_id));
    return sum(Object.values(channelsByTeam).flat().map((c) => c.id));
  }

  const q = teamQuery.trim().toLowerCase();
  const matchesTeam = (team) => !q || team.name.toLowerCase().includes(q);
  const myTeams = teams.filter((t) => t.is_member && matchesTeam(t));
  const otherTeams = teams.filter((t) => !t.is_member && matchesTeam(t));
  const matchesPerson = (p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);

  function PersonRow({ person, showTeams }) {
    const online = presence[person.id]?.online;
    const unread = person.dm_channel_id ? unreadCounts[person.dm_channel_id] : 0;
    const active = selected?.isDirect && selected.personId === person.id;
    const sub = [person.job_title, showTeams && person.shared_teams?.length ? person.shared_teams.join(", ") : null].filter(Boolean).join(" · ") || person.email;
    return (
      <li className="person-item">
        <button
          type="button"
          className={`person-row ${active ? "selected" : ""}`}
          onClick={() => openDirect(person)}
          aria-current={active ? "page" : undefined}
        >
          <Avatar name={person.name} url={person.avatar_url} size={28}>
            {online && <span className={`avatar-presence online presence-${presence[person.id]?.status || "available"}`} />}
          </Avatar>
          <span className="person-main">
            <span className="person-name">{person.name}</span>
            <span className="person-sub">{person.status_message || sub}</span>
          </span>
          <span className={`status-badge ${roleBadgeClass(person.org_role)}`}>{ROLE_LABELS[person.org_role] || person.org_role}</span>
          {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
        <button type="button" className="person-info" onClick={() => setProfileFor(person.id)} aria-label={`View ${person.name}'s profile`} title="View profile">
          <Info size={15} />
        </button>
      </li>
    );
  }

  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const seenBy = lastMessage
    ? reads
        .filter((r) => r.user_id !== user?.id && new Date(r.last_read_at) >= new Date(lastMessage.created_at))
        .map((r) => r.user_name)
    : [];

  const typingNames = Object.values(typingUsers);
  const mentionSuggestions =
    mentionQuery !== null
      ? teamMembers.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
      : [];

  return (
    <Shell>
        <aside className="listpanel">
          <div className="side-tabs" role="tablist" aria-label="Chat sections">
            {[
              ["teams", "My teams"],
              ["people", "Members"],
              ["leads", "Leads"],
              ["groups", "Groups"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                data-tab={key}
                aria-selected={sideTab === key}
                className={`side-tab ${sideTab === key ? "active" : ""}`}
                onClick={() => {
                  setSideTab(key);
                  setTeamQuery("");
                  if (key !== "teams") loadPeople();
                }}
              >
                {label}
                {tabUnread(key) > 0 && <span className="tab-dot">{tabUnread(key) > 99 ? "99+" : tabUnread(key)}</span>}
              </button>
            ))}
          </div>

          <input
            type="search"
            className="listpanel-search"
            placeholder={sideTab === "teams" ? "Search teams" : "Search members"}
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            aria-label={sideTab === "teams" ? "Search teams" : "Search members"}
          />

          {sideNotice && <div className="side-notice" role="status">{sideNotice}</div>}

          {sideTab === "teams" && (
            <>
              <form className="inline-form" onSubmit={createTeam}>
                <input
                  placeholder="New team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <button type="submit">+</button>
              </form>

              <ul className="team-list">
                {myTeams.length === 0 && (
                  <li className="empty-state list-empty">
                    {teams.some((t) => t.is_member)
                      ? "No teams match your search."
                      : "You're not in any team yet. Create one above, or join one below."}
                  </li>
                )}
                {myTeams.map((team) => (
                  <li key={team.id}>
                    <div className="team-row-wrap">
                      <button
                        type="button"
                        className="team-row"
                        aria-expanded={expandedTeamId === team.id}
                        onClick={() => toggleTeam(team)}
                      >
                        {team.name}
                      </button>
                      <button
                        type="button"
                        className="team-people-btn"
                        title={team.my_role === "owner" || user?.org_role === "org_admin" ? "Add or remove people" : "See who's in this team"}
                        aria-label={`People in ${team.name}`}
                        onClick={() => setTeamModal({ id: team.id, name: team.name })}
                      >
                        <Users size={15} />
                      </button>
                    </div>

                    {expandedTeamId === team.id && (
                      <div className="channel-list">
                        {(channelsByTeam[team.id] || []).map((channel) => (
                          <button
                            type="button"
                            key={channel.id}
                            className={`channel-row ${selected?.channelId === channel.id ? "selected" : ""}`}
                            aria-current={selected?.channelId === channel.id ? "page" : undefined}
                            onClick={() => openChannel(team, channel)}
                          >
                            # {channel.name}
                            {unreadCounts[channel.id] > 0 && (
                              <span className="unread-badge">
                                {unreadCounts[channel.id] > 99 ? "99+" : unreadCounts[channel.id]}
                              </span>
                            )}
                          </button>
                        ))}
                        <form className="inline-form small" onSubmit={(e) => createChannel(e, team)}>
                          <input
                            placeholder="New channel"
                            value={newChannelName}
                            onChange={(e) => setNewChannelName(e.target.value)}
                          />
                          <button type="submit">+</button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {otherTeams.length > 0 && (
                <div className="other-teams">
                  <button type="button" className="link-btn" onClick={() => setShowOtherTeams((v) => !v)}>
                    {showOtherTeams ? "Hide" : "Browse"} other teams ({otherTeams.length})
                  </button>
                  {showOtherTeams && (
                    <ul className="team-list">
                      {otherTeams.map((team) => (
                        <li key={team.id}>
                          <div className="team-row-wrap">
                            <span className="team-row team-row-static">{team.name}</span>
                            {user?.org_role === "org_admin" && (
                              <button type="button" className="team-people-btn" aria-label={`People in ${team.name}`} title="Manage people (admin)" onClick={() => setTeamModal({ id: team.id, name: team.name })}>
                                <Users size={15} />
                              </button>
                            )}
                            <button type="button" className="small-btn" onClick={() => joinTeam(team)}>
                              Join
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {sideTab === "people" && (
            <>
              <p className="side-hint">Your teammates and anyone you have chatted with (admins see everyone). Click a name to message them directly.</p>
              <ul className="person-list">
                {people.filter(matchesPerson).length === 0 && (
                  <li className="empty-state list-empty">
                    {people.length === 0
                      ? "No members yet -- invite people to your organization or join a team."
                      : "No one matches your search."}
                  </li>
                )}
                {people.filter(matchesPerson).map((p) => (
                  <PersonRow key={p.id} person={p} showTeams />
                ))}
              </ul>
            </>
          )}

          {sideTab === "leads" && (
            <>
              <p className="side-hint">Your organization's admins, managers and team leads.</p>
              <ul className="person-list">
                {leads.filter(matchesPerson).length === 0 && (
                  <li className="empty-state list-empty">
                    {leads.length === 0 ? "No other admins, managers or team leads yet." : "No one matches your search."}
                  </li>
                )}
                {leads.filter(matchesPerson).map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </ul>
            </>
          )}
          {sideTab === "groups" && (
            <>
              <div className="side-actions">
                <button type="button" className="small-btn" onClick={() => { setGroupError(""); setGroupPick([]); setGroupName(""); setPickQuery(""); setShowNewGroup(true); }}>
                  + New group
                </button>
              </div>
              <p className="side-hint">Chats with three or more people. Create one from people you can message.</p>
              <ul className="person-list">
                {groups.filter((g) => !q || g.name.toLowerCase().includes(q)).length === 0 && (
                  <li className="empty-state list-empty">
                    {groups.length === 0 ? "No group chats yet. Click + New group to start one." : "No groups match your search."}
                  </li>
                )}
                {groups
                  .filter((g) => !q || g.name.toLowerCase().includes(q))
                  .map((g) => {
                    const unread = unreadCounts[g.channel_id] || 0;
                    const active = selected?.isGroup && selected.channelId === g.channel_id;
                    return (
                      <li key={g.channel_id}>
                        <button type="button" className={`person-row ${active ? "selected" : ""}`} onClick={() => openGroup(g)} aria-current={active ? "page" : undefined}>
                          <span className="avatar members-avatar group-avatar" title={g.name}>
                            <Users size={14} />
                          </span>
                          <span className="person-main">
                            <span className="person-name">{g.name}</span>
                            <span className="person-sub">{g.members.map((m) => m.name.split(" ")[0]).join(", ")}</span>
                          </span>
                          {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
          {error && <div className="form-error">{error}</div>}
        </aside>

        <main className="detailpanel">
          {!selected ? (
            <div className="empty-state">
              Pick a channel or a person on the left{teams.some((t) => t.is_member) ? "" : ", or create a team to get started"}.
            </div>
          ) : (
            <>
              <div className="conv-header">
                {selected.isDirect ? (
                  <button type="button" className="name-btn" onClick={() => setProfileFor(selected.personId)} title="View profile">
                    {selected.teamName}
                  </button>
                ) : (
                  <strong>{selected.teamName}</strong>
                )}
                {selected.isGroup ? (
                  <button type="button" className="group-members-btn" onClick={openGroupInfo} title="Group members">
                    <Users size={13} /> {selected.memberCount} members
                  </button>
                ) : selected.isDirect ? (
                  <span className={`status-badge ${roleBadgeClass(selected.role)}`}>{ROLE_LABELS[selected.role] || selected.role}</span>
                ) : (
                  <span className="conv-channel"># {selected.channelName}</span>
                )}
                <div className="conv-tabs">
                  <button
                    className={`tab-btn ${view === "messages" ? "active" : ""}`}
                    onClick={() => setView("messages")}
                  >
                    Messages
                  </button>
                  <button
                    className={`tab-btn ${view === "pinned" ? "active" : ""}`}
                    onClick={() => {
                      setView("pinned");
                      loadPinned(selected.channelId);
                    }}
                  >
                    <Pin size={12} strokeWidth={2} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                    Pinned{pinnedMessages.length > 0 ? ` (${pinnedMessages.length})` : ""}
                  </button>
                  <button className={`tab-btn ${view === "files" ? "active" : ""}`} onClick={() => setView("files")}>
                    Files
                  </button>
                  <button className={`tab-btn ${view === "recap" ? "active" : ""}`} onClick={() => setView("recap")}>
                    Recap
                  </button>
                </div>
                <div className="call-btns">
                  {liveCalls[selected.channelId] && activeCall?.channelId !== selected.channelId && (
                    <button
                      type="button"
                      className="join-call-pill"
                      onClick={() =>
                        joinCall({
                          channelId: selected.channelId,
                          kind: liveCalls[selected.channelId].kind,
                          title: selected.isDirect ? selected.teamName : selected.isGroup ? selected.teamName : `#${selected.channelName}`,
                          direct: !!selected.isDirect,
                        })
                      }
                    >
                      <span className="live-dot" /> Join {liveCalls[selected.channelId].kind === "video" ? "video" : "voice"} call
                    </button>
                  )}
                  {activeCall?.channelId === selected.channelId ? (
                    <span className="in-call-tag">In call</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="call-icon-btn"
                        title="Voice call"
                        aria-label="Start voice call"
                        onClick={() =>
                          startCall({
                            channelId: selected.channelId,
                            kind: "audio",
                            title: selected.isDirect || selected.isGroup ? selected.teamName : `#${selected.channelName}`,
                            direct: !!selected.isDirect,
                          })
                        }
                      >
                        <Phone size={17} strokeWidth={1.9} />
                      </button>
                      <button
                        type="button"
                        className="call-icon-btn"
                        title="Video call"
                        aria-label="Start video call"
                        onClick={() =>
                          startCall({
                            channelId: selected.channelId,
                            kind: "video",
                            title: selected.isDirect || selected.isGroup ? selected.teamName : `#${selected.channelName}`,
                            direct: !!selected.isDirect,
                          })
                        }
                      >
                        <Video size={17} strokeWidth={1.9} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {view === "files" ? (
                <FilesPanel channelId={selected.channelId} />
              ) : view === "recap" ? (
                <RecapPanel channelId={selected.channelId} />
              ) : view === "pinned" ? (
                <div className="pinned-panel">
                  {pinnedMessages.length === 0 ? (
                    <div className="empty-state">No pinned messages in this channel yet.</div>
                  ) : (
                    pinnedMessages.map((m) => (
                      <div key={m.id} className="pinned-item">
                        <div className="pinned-item-head">
                          <Avatar name={m.user_name} url={m.user_avatar_url} size={22} />
                          <span className="msg-author">{m.user_name}</span>
                          <span className="msg-time">{new Date(m.created_at).toLocaleString()}</span>
                          <button type="button" className="link-btn" onClick={() => togglePin(m)}>
                            Unpin
                          </button>
                        </div>
                        {m.attachment && <AttachmentView att={m.attachment} />}
                        {m.content && <div>{renderContent(m.content)}</div>}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <>
                  <div
                    className={`message-list ${dragging ? "drop-active" : ""}`}
                    onDragOver={(e) => {
                      if (e.dataTransfer?.types?.includes("Files")) {
                        e.preventDefault();
                        setDragging(true);
                      }
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      stageFile(e.dataTransfer?.files?.[0]);
                    }}
                  >
                    {groupMessages(messages).map((g) =>
                      g.type === "day" ? (
                        <div key={g.key} className="day-separator">
                          <span>{g.label}</span>
                        </div>
                      ) : (
                        <div key={g.key} className={`message-group ${g.userId === user?.id ? "mine" : ""}`}>
                          <button
                            type="button"
                            className="msg-avatar-wrap avatar-btn"
                            onClick={() => setProfileFor(g.userId)}
                            aria-label={`View ${g.userName}'s profile`}
                          >
                            <Avatar name={g.userName} url={g.avatarUrl} size={28}>
                              {presence[g.userId]?.online && (
                                <span className={`avatar-presence online presence-${presence[g.userId]?.status || "available"}`} />
                              )}
                            </Avatar>
                          </button>
                          <div className="message-group-bubbles">
                            {g.userId !== user?.id && <div className="msg-author">{g.userName}</div>}
                            {g.items.map((m) => (
                              <div key={m.id} className={`bubble ${m.deleted ? "deleted" : ""} ${m.kind === "sticker" ? "bubble-sticker" : ""} ${["poll", "contact", "event"].includes(m.kind) ? "bubble-card" : ""}`}>
                                {m.reply_to && !m.deleted && (
                                  <div className="reply-preview">
                                    <strong>{m.reply_to.user_name}</strong> {m.reply_to.content}
                                  </div>
                                )}
                                {m.deleted ? (
                                  <div className="deleted-msg">This message was deleted.</div>
                                ) : editingId === m.id ? (
                                  <form
                                    className="edit-form"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      saveEdit(m);
                                    }}
                                  >
                                    <input
                                      autoFocus
                                      value={editDraft}
                                      onChange={(e) => setEditDraft(e.target.value)}
                                    />
                                    <button type="submit" className="small-btn">
                                      Save
                                    </button>
                                    <button type="button" className="small-btn" onClick={() => setEditingId(null)}>
                                      Cancel
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    {m.kind === "poll" && m.poll && <PollCard poll={m.poll} meId={user?.id} onVote={(opts) => votePoll(m, opts)} />}
                                    {m.kind === "contact" && m.contact && (
                                      <ContactCard
                                        contact={m.contact}
                                        meId={user?.id}
                                        onProfile={(id) => setProfileFor(id)}
                                        onMessage={(c) => {
                                          setSideTab("people");
                                          openDirect({ id: c.user_id, name: c.name, org_role: c.role });
                                        }}
                                      />
                                    )}
                                    {m.kind === "event" && m.event && <EventCard event={m.event} />}
                                    {m.attachment && <AttachmentView att={m.attachment} sticker={m.kind === "sticker"} />}
                                    {m.content && m.kind !== "poll" && m.kind !== "contact" && m.kind !== "event" && <div>{renderContent(m.content)}</div>}
                                    {m.pinned_at && (
                                      <div className="pinned-tag">
                                        <Pin size={10} strokeWidth={2.2} /> Pinned
                                      </div>
                                    )}
                                    {translateFor === m.id && (
                                      <div className="translate-stub">{fakeTranslate(m.content)}</div>
                                    )}
                                  </>
                                )}

                                {!m.deleted && m.reactions?.length > 0 && (
                                  <div className="reaction-row">
                                    {m.reactions.map((r) => (
                                      <button
                                        type="button"
                                        key={r.emoji}
                                        className={`reaction-pill ${r.me ? "mine" : ""}`}
                                        onClick={() => toggleReaction(m, r.emoji)}
                                      >
                                        {r.emoji} {r.count}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <div className="msg-time">
                                  {new Date(m.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {m.edited_at && !m.deleted && <span className="edited-tag"> (edited)</span>}
                                </div>

                                {!m.deleted && editingId !== m.id && (
                                  <div className="bubble-actions">
                                    <button
                                      type="button"
                                      className="bubble-action-btn"
                                      title="React"
                                      onClick={() => setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)}
                                    >
                                      <Smile size={13} strokeWidth={2} />
                                    </button>
                                    <button
                                      type="button"
                                      className="bubble-action-btn"
                                      title="Reply"
                                      onClick={() => setReplyTo(m)}
                                    >
                                      <Reply size={13} strokeWidth={2} />
                                    </button>
                                    <button
                                      type="button"
                                      className="bubble-action-btn"
                                      title="Translate (demo)"
                                      onClick={() => setTranslateFor(translateFor === m.id ? null : m.id)}
                                    >
                                      <Languages size={13} strokeWidth={2} />
                                    </button>
                                    <button
                                      type="button"
                                      className="bubble-action-btn"
                                      title={m.pinned_at ? "Unpin" : "Pin"}
                                      onClick={() => togglePin(m)}
                                    >
                                      <Pin size={13} strokeWidth={2} />
                                    </button>
                                    {m.user_id === user?.id && (
                                      <>
                                        <button
                                          type="button"
                                          className="bubble-action-btn"
                                          title="Edit"
                                          onClick={() => startEdit(m)}
                                        >
                                          <Pencil size={13} strokeWidth={2} />
                                        </button>
                                        <button
                                          type="button"
                                          className="bubble-action-btn"
                                          title="Delete"
                                          onClick={() => deleteMessage(m)}
                                        >
                                          <Trash2 size={13} strokeWidth={2} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}

                                {reactionPickerFor === m.id && (
                                  <div className="emoji-picker">
                                    {QUICK_EMOJIS.map((em) => (
                                      <button
                                        type="button"
                                        key={em}
                                        className="emoji-option"
                                        onClick={() => toggleReaction(m, em)}
                                      >
                                        {em}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="chat-status-line">
                    {typingNames.length > 0 && (
                      <span className="typing-indicator">
                        {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing...
                      </span>
                    )}
                    {seenBy.length > 0 && <span className="seen-by">Seen by {seenBy.join(", ")}</span>}
                  </div>

                  {recordError && <div className="form-error">{recordError}</div>}

                  {replyTo && (
                    <div className="composer-reply-bar">
                      <Reply size={13} strokeWidth={2} />
                      <span>
                        Replying to <strong>{replyTo.user_name}</strong>: {replyTo.content.slice(0, 80)}
                      </span>
                      <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {mentionSuggestions.length > 0 && (
                    <div className="mention-suggestions">
                      {mentionSuggestions.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          className="mention-suggestion"
                          onClick={() => pickMention(m.name)}
                        >
                          @{m.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {pendingFile && (
                    <div className="pending-file">
                      <FileText size={16} />
                      <span className="pending-file-name">{pendingFile.name}</span>
                      <span className="att-meta">{humanSize(pendingFile.size)}</span>
                      {sending ? (
                        <span className="pending-progress" aria-label="Uploading">
                          <span style={{ width: `${uploadPct}%` }} />
                        </span>
                      ) : (
                        <button type="button" className="link-btn" onClick={() => setPendingFile(null)} aria-label="Remove attachment">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="composer-wrap" ref={composerWrapRef}>
                    {showEmoji && (
                      <div className="emoji-popover" role="dialog" aria-label="Emoji picker">
                        {COMPOSER_EMOJIS.map((em) => (
                          <button type="button" key={em} className="emoji-cell" onClick={() => insertEmoji(em)}>
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                    {showAttachMenu && (
                      <div className="attach-menu" role="menu">
                        {[
                          { key: "doc", label: "Document", icon: FileText, color: "#7c5cf0", run: () => attachInputRef.current?.click() },
                          { key: "media", label: "Photos & videos", icon: ImageIcon, color: "#1f7ae0", run: () => mediaInputRef.current?.click() },
                          { key: "camera", label: "Camera", icon: Camera, color: "#e0457b", run: () => setComposerModal("camera") },
                          { key: "audio", label: "Audio", icon: Headphones, color: "#f07a2a", run: () => audioInputRef.current?.click() },
                          { key: "contact", label: "Contact", icon: UserIcon, color: "#0a9bd8", run: () => setComposerModal("contact") },
                          { key: "poll", label: "Poll", icon: BarChart3, color: "#e8a90c", run: () => setComposerModal("poll") },
                          { key: "event", label: "Event", icon: CalendarDays, color: "#e0457b", run: () => setComposerModal("event") },
                          { key: "sticker", label: "New sticker", icon: StickerIcon, color: "#10a37f", run: () => setComposerModal("sticker") },
                        ].map(({ key, label, icon: Icon, color, run }) => (
                          <button
                            key={key}
                            type="button"
                            role="menuitem"
                            data-attach={key}
                            onClick={() => {
                              setShowAttachMenu(false);
                              run();
                            }}
                          >
                            <span className="attach-icon" style={{ color }}>
                              <Icon size={19} strokeWidth={2} />
                            </span>
                            {label}
                          </button>
                        ))}
                        <div className="attach-sep" />
                        <button
                          type="button"
                          role="menuitem"
                          data-attach="video-message"
                          onClick={() => {
                            setShowAttachMenu(false);
                            startRecording("video");
                          }}
                        >
                          <span className="attach-icon" style={{ color: "#5c6578" }}>
                            <Video size={19} strokeWidth={2} />
                          </span>
                          Record a video message
                        </button>
                      </div>
                    )}
                    <form className="composer-bar" onSubmit={sendMessage}>
                      {[
                        [attachInputRef, ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.md,.json,.zip,.rar,.7z"],
                        [mediaInputRef, "image/*,video/*"],
                        [audioInputRef, "audio/*"],
                      ].map(([ref, accept]) => (
                        <input
                          key={accept}
                          ref={ref}
                          type="file"
                          accept={accept}
                          hidden
                          onChange={(e) => {
                            stageFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        className="cb-icon"
                        title="Attach"
                        aria-label="Attach a file"
                        aria-expanded={showAttachMenu}
                        onClick={() => {
                          setShowAttachMenu((v) => !v);
                          setShowEmoji(false);
                        }}
                        disabled={sending || !!recording}
                      >
                        <Paperclip size={20} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className="cb-icon"
                        title="Emoji"
                        aria-label="Add emoji"
                        aria-expanded={showEmoji}
                        onClick={() => {
                          setShowEmoji((v) => !v);
                          setShowAttachMenu(false);
                        }}
                        disabled={!!recording}
                      >
                        <Smile size={20} strokeWidth={1.8} />
                      </button>

                      {recording ? (
                        <div className="rec-indicator" role="status">
                          <span className="rec-dot" />
                          Recording {recording === "video" ? "video" : "voice"} message...
                          <button type="button" className="link-btn" onClick={cancelRecording}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <input
                          ref={draftInputRef}
                          className="cb-input"
                          placeholder={pendingFile ? "Add a caption (optional)" : "Type a message"}
                          value={draft}
                          onChange={(e) => onDraftChange(e.target.value)}
                          onPaste={(e) => {
                            const f = e.clipboardData?.files?.[0];
                            if (f) {
                              e.preventDefault();
                              stageFile(f);
                            }
                          }}
                        />
                      )}

                      {recording ? (
                        <button type="button" className="cb-send" onClick={stopRecording} title="Stop and send" aria-label="Stop recording and send">
                          <SendHorizontal size={19} strokeWidth={2} />
                        </button>
                      ) : draft.trim() || pendingFile ? (
                        <button type="submit" className="cb-send" disabled={sending} title="Send" aria-label="Send message">
                          <SendHorizontal size={19} strokeWidth={2} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="cb-icon cb-mic"
                          title="Record a voice message"
                          aria-label="Record a voice message"
                          onClick={() => startRecording("audio")}
                        >
                          <Mic size={21} strokeWidth={1.8} />
                        </button>
                      )}
                    </form>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      {teamModal && (
        <TeamMembersModal
          teamId={teamModal.id}
          teamName={teamModal.name}
          onClose={() => setTeamModal(null)}
          onChanged={() => loadTeams()}
        />
      )}

      {composerModal === "camera" && (
        <CameraModal
          onClose={() => setComposerModal(null)}
          onUse={(file) => {
            setComposerModal(null);
            stageFile(file);
          }}
        />
      )}
      {composerModal === "poll" && selected && <PollModal channelId={selected.channelId} onClose={() => setComposerModal(null)} onSent={() => setComposerModal(null)} />}
      {composerModal === "contact" && selected && (
        <ContactModal channelId={selected.channelId} candidates={candidates} onClose={() => setComposerModal(null)} onSent={() => setComposerModal(null)} />
      )}
      {composerModal === "event" && selected && (
        <EventModal
          channelId={selected.channelId}
          isTeamChannel={!selected.isDirect && !selected.isGroup}
          onClose={() => setComposerModal(null)}
          onSent={() => setComposerModal(null)}
        />
      )}
      {composerModal === "sticker" && selected && <StickerModal channelId={selected.channelId} onClose={() => setComposerModal(null)} onSent={() => setComposerModal(null)} />}

      {profileFor && (
        <ProfileModal
          userId={profileFor}
          onClose={() => setProfileFor(null)}
          onMessage={(p) => {
            setProfileFor(null);
            setSideTab("people");
            openDirect({ id: p.id, name: p.name, org_role: p.org_role });
          }}
        />
      )}

      {showNewGroup && (
        <div className="modal-overlay" onClick={() => setShowNewGroup(false)}>
          <div className="modal group-modal" role="dialog" aria-modal="true" aria-label="New group" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New group chat</h3>
              <button type="button" className="link-btn" onClick={() => setShowNewGroup(false)}>Cancel</button>
            </div>
            <form className="event-form" onSubmit={createGroup}>
              <input placeholder="Group name (e.g. Launch team)" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} autoFocus />
              <input type="search" placeholder="Search people" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
              <div className="pick-list">
                {candidates
                  .filter((p) => !pickQuery.trim() || p.name.toLowerCase().includes(pickQuery.trim().toLowerCase()))
                  .map((p) => (
                    <label key={p.id} className="pick-row">
                      <input type="checkbox" checked={groupPick.includes(p.id)} onChange={() => togglePick(p.id)} />
                      <span className="person-name">{p.name}</span>
                      <span className={`status-badge ${roleBadgeClass(p.org_role)}`}>{ROLE_LABELS[p.org_role]}</span>
                    </label>
                  ))}
                {candidates.length === 0 && <div className="empty-state">No one to add yet -- join a team first.</div>}
              </div>
              <p className="side-hint" style={{ margin: 0 }}>
                {candidates.length < 2
                  ? `A group needs at least 2 other people besides you, but only ${candidates.length} ${candidates.length === 1 ? "person is" : "people are"} available in this organization. Invite more members first (Members page), or just message them directly.`
                  : `${groupPick.length} selected (pick at least 2).`}
              </p>
              {groupError && <div className="form-error">{groupError}</div>}
              <div className="event-form-row">
                <button type="submit" disabled={groupBusy || !groupName.trim() || groupPick.length < 2}>
                  {groupBusy ? "Creating..." : "Create group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGroupInfo && groupInfo && (
        <div className="modal-overlay" onClick={() => setShowGroupInfo(false)}>
          <div className="modal group-modal" role="dialog" aria-modal="true" aria-label="Group members" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{groupInfo.name}</h3>
              <button type="button" className="link-btn" onClick={() => setShowGroupInfo(false)}>Close</button>
            </div>
            {(groupInfo.created_by === user.id || user.org_role === "org_admin") && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  renameGroup(e.target.elements.gname.value);
                }}
              >
                <input name="gname" defaultValue={groupInfo.name} maxLength={80} aria-label="Group name" />
                <button type="submit">Rename</button>
              </form>
            )}
            <div className="pick-list">
              {groupInfo.members.map((m) => (
                <div key={m.id} className="pick-row">
                  <span className="person-name">
                    {m.name}
                    {m.id === user.id ? " (you)" : ""}
                    {m.id === groupInfo.created_by ? " · creator" : ""}
                  </span>
                  <span className={`status-badge ${roleBadgeClass(m.org_role)}`}>{ROLE_LABELS[m.org_role]}</span>
                  {m.id !== user.id && (groupInfo.created_by === user.id || user.org_role === "org_admin") && (
                    <button type="button" className="small-btn admin-btn-bad" onClick={() => removeFromGroup(m.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
            {(groupInfo.created_by === user.id || user.org_role === "org_admin") && (
              <>
                <h4 className="group-add-title">Add people</h4>
                <input type="search" placeholder="Search people" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
                <div className="pick-list">
                  {candidates
                    .filter((p) => !groupInfo.members.some((m) => m.id === p.id))
                    .filter((p) => !pickQuery.trim() || p.name.toLowerCase().includes(pickQuery.trim().toLowerCase()))
                    .map((p) => (
                      <label key={p.id} className="pick-row">
                        <input type="checkbox" checked={groupPick.includes(p.id)} onChange={() => togglePick(p.id)} />
                        <span className="person-name">{p.name}</span>
                        <span className={`status-badge ${roleBadgeClass(p.org_role)}`}>{ROLE_LABELS[p.org_role]}</span>
                      </label>
                    ))}
                </div>
                <div className="event-form-row">
                  <button type="button" onClick={addToGroup} disabled={groupBusy || groupPick.length === 0}>
                    Add {groupPick.length || ""} selected
                  </button>
                </div>
              </>
            )}
            {groupError && <div className="form-error">{groupError}</div>}
            <div className="event-form-row">
              <button type="button" className="admin-btn-bad" onClick={() => removeFromGroup(user.id)}>Leave group</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
