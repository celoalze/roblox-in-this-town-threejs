--!nonstrict
-- Roblox Shorts Studio runtime. Injected by pipeline/render/studio.py with the resolved timeline as TL (JSON).
-- Edit-mode playback: builds the cast from catalog IDs (R15 + dynamic heads), steps animations manually,
-- drives FaceControls (expressions, talking, blinks) and a 9:16 camera (rolled 90 deg; the capture is rotated back).
local HttpService, Players, AS, MS, IS = game:GetService("HttpService"), game:GetService("Players"), game:GetService("AssetService"), game:GetService("MarketplaceService"), game:GetService("InsertService")
local TL = HttpService:JSONDecode([==[__TIMELINE__]==])

local old = workspace:FindFirstChild("ShortsStage"); if old then old:Destroy() end
local root = Instance.new("Folder"); root.Name = "ShortsStage"; root.Parent = workspace
local cam = workspace.CurrentCamera

-- ---------- world ----------
local W = TL.world
local yaw = math.rad(W.yaw or 0)
local A0 = Vector3.new(W.anchor[1], 600, W.anchor[2])
local rp = RaycastParams.new(); rp.FilterDescendantsInstances = {root}; rp.FilterType = Enum.RaycastFilterType.Exclude
local function groundAt(x, z)
  local h = workspace:Raycast(Vector3.new(x, A0.Y, z), Vector3.new(0, -300, 0), rp); return h and h.Position.Y or 534
end
local G = groundAt(A0.X, A0.Z)
local function world(x, z) -- story coords (x right, z toward camera) -> world position on the ground
  local c, s = math.cos(yaw), math.sin(yaw)
  local wx, wz = A0.X + x * c + z * s, A0.Z - x * s + z * c
  return Vector3.new(wx, groundAt(wx, wz), wz)
end
-- hide small clutter (bollards, planters) near the stage; restored at the end
local hidden = {}
if (W.clear or 0) > 0 then
  local op = OverlapParams.new(); op.FilterDescendantsInstances = {root}; op.FilterType = Enum.RaycastFilterType.Exclude
  for _, p in ipairs(workspace:GetPartBoundsInBox(CFrame.new(A0.X, G + 4, A0.Z), Vector3.new(W.clear * 2, 7, W.clear * 2), op)) do
    if p.Size.Y < 8 and p.Size.X < 8 and p.Size.Z < 8 and p.Position.Y > G + .3 and p.Transparency < 1 then
      table.insert(hidden, {p, p.Transparency, p.CanCollide}); p.Transparency = 1; p.CanCollide = false
      for _, d in ipairs(p:GetChildren()) do if d:IsA("Decal") or d:IsA("Texture") then table.insert(hidden, {d, d.Transparency}); d.Transparency = 1 end end
    end
  end
end
if W.time then pcall(function() game.Lighting.ClockTime = W.time end) end

-- ---------- cast ----------
local ANIM = { idle = 507766388, walk = 507777826, run = 507767714, wave = 507770239, point = 507770453, cheer = 507770677, laugh = 507770818,
  dance = 507771019, dance2 = 507776043, dance3 = 507777268, jump = 507765000, fall = 507767968, climb = 507765644 }
local EMOTE = { shrug = 3576968026, hello = 3576686446, salute = 3360689775, applaud = 5915779043, tilt = 3360692915, point2 = 3576823880 }
local function emoteAnimId(assetId)
  local ok, m = pcall(function() return IS:LoadAsset(assetId) end)
  if ok and m then local a = m:FindFirstChildWhichIsA("Animation", true); local id = a and a.AnimationId; m:Destroy(); return id end
end
local headCache = {}
local function headFromBundle(bid)
  if headCache[bid] ~= nil then return headCache[bid] end
  local ok, d = pcall(function() return AS:GetBundleDetailsAsync(bid) end); local id = 0
  if ok then for _, it in ipairs(d.Items) do if it.Type == "Asset" then local okp, info = pcall(function() return MS:GetProductInfo(it.Id) end); if okp and info.AssetTypeId == 79 then id = it.Id break end end end end
  headCache[bid] = id; return id
end
local function hex(h) h = h:gsub("#", ""); return Color3.fromRGB(tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16)) end

local actors = {}
for id, c in pairs(TL.cast) do
  local d = Instance.new("HumanoidDescription")
  if c.head then d.Head = (c.head < 100000 and headFromBundle(c.head) or c.head) end
  local acc = {}; for _, h in ipairs(c.hair or {}) do table.insert(acc, tostring(h)) end; d.HairAccessory = table.concat(acc, ",")
  if c.hat then d.HatAccessory = tostring(c.hat) end
  if c.face_acc then d.FaceAccessory = tostring(c.face_acc) end
  if c.back then d.BackAccessory = tostring(c.back) end
  d.Shirt = c.shirt or 0; d.Pants = c.pants or 0; if c.tshirt then d.GraphicTShirt = c.tshirt end
  if c.skin then for _, k in ipairs({"HeadColor", "TorsoColor", "LeftArmColor", "RightArmColor", "LeftLegColor", "RightLegColor"}) do d[k] = hex(c.skin) end end
  local m = Players:CreateHumanoidModelFromDescription(d, Enum.HumanoidRigType.R15)
  m.Name = id; m.Humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
  for _, p in ipairs(m:GetDescendants()) do if p:IsA("BasePart") then p.Anchored = false; p.CanCollide = false end end
  m.HumanoidRootPart.Anchored = true; m:PivotTo(CFrame.new(0, -500, 0)); m.Parent = root
  local an = m.Humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", m.Humanoid)
  local fc = m.Head:FindFirstChildWhichIsA("FaceControls", true)
  actors[id] = { m = m, an = an, fc = fc, tracks = {}, cur = nil, hipH = m.Humanoid.HipHeight + m.HumanoidRootPart.Size.Y / 2, scale = c.scale or 1 }
  if c.scale and c.scale ~= 1 then m:ScaleTo(c.scale) end
end
local function track(A, name)
  if A.tracks[name] then return A.tracks[name] end
  local aid = ANIM[name] and ("rbxassetid://" .. ANIM[name]) or (EMOTE[name] and emoteAnimId(EMOTE[name])) or (tonumber(name) and ("rbxassetid://" .. name))
  if not aid then aid = "rbxassetid://" .. ANIM.idle end
  local a = Instance.new("Animation"); a.AnimationId = aid; local t = A.an:LoadAnimation(a)
  t.Looped = (name == "idle" or name == "walk" or name == "run" or name == "laugh" or name:find("dance") ~= nil)
  A.tracks[name] = t; return t
end
local function play(A, name, fade)
  if A.cur == name then return end
  if A.cur then A.tracks[A.cur]:Stop(fade or .2) end
  local t = track(A, name); t:Play(fade or .2); if name == "walk" then t:AdjustSpeed(1.1) end; A.cur = name
end
-- preload every anim used so playback never stalls
for _, sc in ipairs(TL.scenes) do for _, a in ipairs(sc.actors or {}) do local A = actors[a.id]; if A then track(A, a.anim or "idle"); for _, ac in ipairs(a.acts or {}) do if ac.anim then track(A, ac.anim) end end; track(A, "walk") end end end

-- ---------- faces (FaceControls, 0..1) ----------
local EXPR = {
  neutral = {}, happy = {LeftLipCornerPuller = .7, RightLipCornerPuller = .7, LeftCheekRaiser = .4, RightCheekRaiser = .4},
  laugh = {LeftLipCornerPuller = 1, RightLipCornerPuller = 1, JawDrop = .45, LeftCheekRaiser = .8, RightCheekRaiser = .8, LeftEyeClosed = .55, RightEyeClosed = .55},
  smug = {LeftLipCornerPuller = .6, RightLipCornerPuller = .1, LeftBrowLowerer = .3, RightOuterBrowRaiser = .4},
  sad = {LeftLipCornerDepressor = .7, RightLipCornerDepressor = .7, LeftInnerBrowRaiser = .8, RightInnerBrowRaiser = .8, LeftEyeClosed = .15, RightEyeClosed = .15},
  worried = {LeftInnerBrowRaiser = .9, RightInnerBrowRaiser = .9, LeftLipStretcher = .4, RightLipStretcher = .4},
  nervous = {LeftInnerBrowRaiser = .7, RightInnerBrowRaiser = .7, LeftLipStretcher = .7, RightLipStretcher = .7, LeftLipCornerPuller = .2, RightLipCornerPuller = .2},
  angry = {LeftBrowLowerer = 1, RightBrowLowerer = 1, LeftLipCornerDepressor = .4, RightLipCornerDepressor = .4, LowerLipDepressor = .2, LeftNoseWrinkler = .4, RightNoseWrinkler = .4},
  shocked = {JawDrop = .65, LeftUpperLidRaiser = 1, RightUpperLidRaiser = 1, LeftInnerBrowRaiser = 1, RightInnerBrowRaiser = 1, LeftOuterBrowRaiser = 1, RightOuterBrowRaiser = 1},
  surprised = {JawDrop = .35, LeftUpperLidRaiser = .8, RightUpperLidRaiser = .8, LeftOuterBrowRaiser = .8, RightOuterBrowRaiser = .8},
  scared = {LeftInnerBrowRaiser = 1, RightInnerBrowRaiser = 1, LeftUpperLidRaiser = .9, RightUpperLidRaiser = .9, LeftLipStretcher = .8, RightLipStretcher = .8, JawDrop = .15},
}
local FACE_KEYS = {}; for _, e in pairs(EXPR) do for k in pairs(e) do FACE_KEYS[k] = true end end
FACE_KEYS.JawDrop = true; FACE_KEYS.LeftEyeClosed = true; FACE_KEYS.RightEyeClosed = true; FACE_KEYS.Pucker = true
local function setFace(A, expr, mouth, blink)
  if not A.fc then return end
  local e = EXPR[expr] or EXPR.neutral
  for k in pairs(FACE_KEYS) do
    local v = e[k] or 0
    if k == "JawDrop" then v = math.max(v, mouth * .55) end
    if k == "Pucker" then v = mouth * .15 end
    if blink and (k == "LeftEyeClosed" or k == "RightEyeClosed") then v = 1 end
    pcall(function() A.fc[k] = v end)
  end
end

-- ---------- scene state ----------
local function yawTo(from, to) return math.atan2(to.X - from.X, to.Z - from.Z) end
local function storyYaw(deg) return math.rad(deg or 0) + yaw end
local function sceneAt(t) for i, s in ipairs(TL.scenes) do if t >= s.start and t < s.start + s.dur then return s, i end end; return TL.scenes[#TL.scenes], #TL.scenes end
local lastPos = {}
-- resolve positions per scene once (carry-over positions when "at" is omitted)
for _, s in ipairs(TL.scenes) do
  for _, a in ipairs(s.actors or {}) do
    a._p0 = a.at and world(a.at[1], a.at[2]) or lastPos[a.id] or world(0, 0)
    local cur = a._p0; local acts = {}
    if a.to then table.insert(acts, {t = 0, to = a.to, anim = a.anim, speed = a.speed}) end
    for _, ac in ipairs(a.acts or {}) do table.insert(acts, ac) end
    table.sort(acts, function(x, y) return x.t < y.t end)
    for _, ac in ipairs(acts) do
      if ac.to then ac._p0 = cur; ac._p1 = world(ac.to[1], ac.to[2]); ac._d = math.max(.3, (ac._p1 - cur).Magnitude / (ac.speed or (ac.anim == "run" and 16 or 9))); cur = ac._p1 end
    end
    a._acts = acts; lastPos[a.id] = cur
  end
end

local function actorState(s, a, lt)
  local pos, moving, dir = a._p0, false, nil
  local anim, expr, face = a.anim or "idle", a.expr or "neutral", a.face
  for _, ac in ipairs(a._acts) do
    if lt >= ac.t then
      if ac.anim and not ac.to then anim = ac.anim end
      if ac.expr then expr = ac.expr end
      if ac.face ~= nil then face = ac.face end
      if ac._p1 then
        local k = math.clamp((lt - ac.t) / ac._d, 0, 1); pos = ac._p0:Lerp(ac._p1, k)
        if k < 1 then moving = true; dir = yawTo(ac._p0, ac._p1); anim = (ac.anim == "run") and "run" or "walk" else anim = ac.after or (ac.anim ~= "walk" and ac.anim ~= "run" and ac.anim) or "idle" end
      end
    end
  end
  return pos, moving, dir, anim, expr, face
end

-- ---------- camera ----------
local SHOT = { extreme = {3.2, 1.6, .1}, close = {5.2, 1.5, .25}, medium = {8.5, 1.0, .5}, full = {12, .5, 1}, wide = {19, .2, 2.5}, establishing = {34, 0, 9} }
local FOV_FINAL = 50
local roll = CFrame.Angles(0, 0, math.rad(90))
local vp = cam.ViewportSize
local fovRoblox = math.deg(2 * math.atan(math.tan(math.rad(FOV_FINAL) / 2) * (vp.Y / (vp.Y * 16 / 9))))
local function headPos(A) local h = A.m:FindFirstChild("Head"); return h and h.Position or A.m:GetPivot().Position end
local function shoot(pos, look, rollDeg)
  local h = workspace:Raycast(look, pos - look, rp)
  if h then pos = look + (pos - look).Unit * math.max(2, h.Distance - .8) end
  cam.FieldOfView = fovRoblox
  cam.CFrame = CFrame.lookAt(pos, look) * roll * CFrame.Angles(0, 0, math.rad(rollDeg or 0))
end
local function smooth(k) return k * k * (3 - 2 * k) end
local function cameraAt(s, lt, states)
  local c = s.camera or {}; local sh = SHOT[s.shot or "medium"] or SHOT.medium
  local k = smooth(math.clamp(lt / s.dur, 0, 1))
  local target = c.target or (s.actors and s.actors[1] and s.actors[1].id)
  local look, baseYaw, dist = nil, yaw, sh[1]
  if type(target) == "table" then local p = world(target[1], target[3] or target[2]); look = p + Vector3.new(0, target[2] or 3, 0)
  elseif target == "group" then
    local sum, n, ps = Vector3.zero, 0, {}
    for id, st in pairs(states) do sum += st.pos; n += 1; table.insert(ps, st.pos) end
    look = (n > 0 and sum / n or world(0, 0)) + Vector3.new(0, 3.2 + sh[2] * .3, 0)
    local spread = 0; for _, p in ipairs(ps) do spread = math.max(spread, (Vector3.new(p.X, 0, p.Z) - Vector3.new(look.X, 0, look.Z)).Magnitude) end
    dist = math.max(dist, spread * 2.2 + 7)
  else
    local A = actors[target]; local hp = A and headPos(A) or world(0, 0) + Vector3.new(0, 4.5, 0)
    look = hp - Vector3.new(0, sh[2] - .2, 0)
    if states[target] then baseYaw = s._yaw0 or states[target].yaw; s._yaw0 = baseYaw end
  end
  dist *= (c.zoom or 1)
  local ang = math.rad(c.angle or 15) + (c.absolute and yaw or baseYaw)
  local elev = c.height or sh[3]
  local mv = c.move or "push"
  if mv == "push" then dist *= 1.15 - .25 * k elseif mv == "pull" then dist *= .85 + .3 * k elseif mv == "orbit" then ang += math.rad(c.amount or 35) * (k - .5) elseif mv == "drift" then ang += .12 * (k - .5); dist *= 1.03 - .06 * k elseif mv == "rise" then elev += 5 * k end
  if s.punch then local pk = math.clamp(lt / .18, 0, 1); dist *= 1 + .35 * (1 - smooth(pk)) end
  local pos = look + Vector3.new(math.sin(ang) * dist, elev, math.cos(ang) * dist)
  local shake = (c.shake or 0)
  if shake > 0 then local t = lt * 60; pos += Vector3.new(math.sin(t * 1.7) * .1, math.sin(t * 2.3 + 1) * .08, 0) * shake * 2 end
  shoot(pos, look, c.roll)
end

-- ---------- playback ----------
-- sync flash: 1 s of white in front of the lens, then the timeline starts (pipeline trims at the flash end)
local flash = Instance.new("Part"); flash.Anchored = true; flash.CanCollide = false; flash.Size = Vector3.new(200, 200, .2); flash.Material = Enum.Material.Neon; flash.Color = Color3.new(1, 1, 1); flash.Parent = root
local s1 = TL.scenes[1]
for id, A in pairs(actors) do A.m:PivotTo(CFrame.new(0, -500, 0)) end
cam.CFrame = CFrame.new(A0.X, G + 40, A0.Z) * roll; flash.CFrame = cam.CFrame * CFrame.new(0, 0, -3)

task.spawn(function()
  local t0 = os.clock() + 1.0
  while os.clock() < t0 do task.wait() end
  flash:Destroy()
  local start = os.clock(); local last = start; local prevScene = nil
  while true do
    local now = os.clock(); local t = now - start; local dt = now - last; last = now
    if t > TL.duration + .3 then break end
    local s = sceneAt(t); local lt = t - s.start
    local states, present = {}, {}
    for _, a in ipairs(s.actors or {}) do
      local A = actors[a.id]
      if A then
        present[a.id] = true
        local pos, moving, dir, anim, expr, face = actorState(s, a, lt)
        states[a.id] = {pos = pos, a = a, anim = anim, expr = expr, face = face, dir = dir}
      end
    end
    for id, st in pairs(states) do
      local A = actors[id]; local y
      if st.dir then y = st.dir
      elseif type(st.face) == "string" and states[st.face] then y = yawTo(st.pos, states[st.face].pos)
      elseif type(st.face) == "number" then y = storyYaw(st.face)
      else y = yaw end
      st.yaw = y
      A.m:PivotTo(CFrame.new(st.pos + Vector3.new(0, A.hipH * A.scale, 0)) * CFrame.Angles(0, y, 0))
      play(A, st.anim)
      local mouth = 0
      if s.speaker == id then for _, w in ipairs(s.words or {}) do if t >= w.s and t < w.e then local ph = math.sin(t * 22 + #id); mouth = ph > .2 and 1 or (ph > -.4 and .5 or .1) break end end end
      local blink = ((t + #id * .37) % 3.6) < .12
      setFace(A, st.expr, mouth, blink)
      A.an:StepAnimations(dt)
    end
    for id, A in pairs(actors) do if not present[id] and prevScene ~= s then A.m:PivotTo(CFrame.new(0, -500, 0)) end end
    prevScene = s
    cameraAt(s, lt, states)
    task.wait()
  end
  for _, h in ipairs(hidden) do h[1].Transparency = h[2]; if h[3] ~= nil then h[1].CanCollide = h[3] end end
  root:SetAttribute("done", true)
end)
return string.format("runtime started: %d scenes, %.1fs, vp=%s, fov=%.1f, hidden=%d", #TL.scenes, TL.duration, tostring(vp), fovRoblox, #hidden)
