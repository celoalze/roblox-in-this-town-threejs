local THIN_ALL = true
local HttpService, KSP = game:GetService("HttpService"), game:GetService("KeyframeSequenceProvider")
local function r(n) return math.floor(n * 100 + (n >= 0 and 0.5 or -0.5)) / 100 end -- 2 decimals (compact)
local ORDER = {"HumanoidRootPart", "Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Head"}
local ORDER15 = {"HumanoidRootPart", "LowerTorso", "UpperTorso", "Head", "RightUpperArm", "RightLowerArm", "RightHand", "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightUpperLeg", "RightLowerLeg", "RightFoot", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot"}
local R15 = {UpperTorso = 1, LowerTorso = 1, RightUpperArm = 1, LeftUpperArm = 1, RightUpperLeg = 1, LeftUpperLeg = 1}
local TOL = 0.04 -- key thinning: a key is dropped when every pose is within TOL (rad / studs) of the straight line between its kept neighbours (0 = keep all)

local function export(id)
  local ok, ks = pcall(function() return KSP:GetKeyframeSequenceAsync("rbxassetid://" .. id) end)
  if not ok or not ks then
    local ok2, objs = pcall(function() return game:GetObjects("rbxassetid://" .. id) end)
    if ok2 and objs[1] and objs[1]:IsA("KeyframeSequence") then ks = objs[1] else return {id = id, error = tostring(ks)} end
  end
  local kfs, length, rig = {}, 0, "R6"
  for _, k in ipairs(ks:GetKeyframes()) do
    local poses, votes = {}, {}
    for _, p in ipairs(k:GetDescendants()) do
      if p:IsA("Pose") and not p.Name:find("Hand") and not p.Name:find("Foot") then -- hands/feet are lost in the R6 retarget anyway
        if R15[p.Name] then rig = "R15" end
        if p.Weight > 0 then
          local cf = p.CFrame; local rx, ry, rz = cf:ToEulerAnglesXYZ()
          local e = {r(rx), r(ry), r(rz)}
          if p.Name == "Torso" or p.Name == "HumanoidRootPart" or p.Name == "LowerTorso" or p.Name == "UpperTorso" then e[4], e[5], e[6] = r(cf.X), r(cf.Y), r(cf.Z) end
          poses[p.Name] = e; votes[p.EasingStyle.Name] = (votes[p.EasingStyle.Name] or 0) + 1
        end
      end
    end
    local best, bn = "Linear", 0; for s, n in pairs(votes) do if n > bn then best, bn = s, n end end
    table.insert(kfs, {t = r(k.Time), e = best, poses = poses}); if k.Time > length then length = k.Time end
  end
  table.sort(kfs, function(a, b) return a.t < b.t end)
  local order = rig == "R15" and ORDER15 or ORDER
  local function arr(k) local a = {}; for i, n in ipairs(order) do a[i] = k.poses[n] or 0 end; return a end
  local function close(a, b, c, f) -- is pose set b (at fraction f between a and c) on the line a-c?
    for _, n in ipairs(order) do
      local pa, pb, pc = a.poses[n], b.poses[n], c.poses[n]
      if (pa == nil) ~= (pb == nil) or (pb == nil) ~= (pc == nil) then return false end
      if pb then for i = 1, #pb do if math.abs(pb[i] - (pa[i] + (pc[i] - pa[i]) * f)) > TOL then return false end end end
    end
    return true
  end
  if TOL > 0 and #kfs > 3 then
    local kept, last = {kfs[1]}, 1
    for i = 2, #kfs - 1 do
      local a, c = kept[#kept], kfs[i + 1]
      local f = (kfs[i].t - a.t) / math.max(1e-6, c.t - a.t)
      if not ((THIN_ALL or kfs[i].e == "Linear") and close(a, kfs[i], c, f)) then table.insert(kept, kfs[i]) end
    end
    table.insert(kept, kfs[#kfs]); kfs = kept
  end
  for _, k in ipairs(kfs) do k.p = arr(k); k.poses = nil end
  return {id = id, order = order, rig = rig, looped = ks.Loop, priority = ks.Priority.Name, length = r(length), kfs = kfs}
end

return function(IDS, POST_NAME, MODELS)
MODELS = MODELS or {}
local out = {}
for _, id in ipairs(IDS) do out[tostring(id)] = export(id) end
if #MODELS > 0 then
  local models = {}
  for _, mid in ipairs(MODELS) do
    local list = {}
    local ok, objs = pcall(function() return game:GetObjects("rbxassetid://" .. mid) end)
    if ok then for _, o in ipairs(objs) do for _, d in ipairs(o:GetDescendants()) do
      if d:IsA("Animation") then table.insert(list, {name = d.Parent and d.Parent.Name .. "/" .. d.Name or d.Name, id = tostring(d.AnimationId):match("%d+")}) end
      if d:IsA("KeyframeSequence") then table.insert(list, {name = "KFS:" .. d.Name, kfs = true}) end
    end end else list = {error = tostring(objs)} end
    models[tostring(mid)] = list
  end
  out.models = models
end
local json = HttpService:JSONEncode(out)
return json
end
