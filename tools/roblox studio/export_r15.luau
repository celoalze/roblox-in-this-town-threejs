-- Exports the default Roblox R15 rig (skeleton, attachments, mesh geometry) as one compact JSON string.
-- Run through the Roblox_Studio MCP (execute_luau, datamodel "Edit"); the tool saves a result this large to a file under
--   ...\.claude\projects\<project>\<session>\tool-results\mcp-Roblox_Studio-execute_luau-*.txt  -> copy it to cache/r15/raw.json
-- then:  python tools/roblox studio/build_r15.py   (writes assets/models/rigs/r15/rig.json + <part>.json)
-- The result is ~240 KB but the MCP tool truncates a returned string at ~100 KB: this script as run through the tool therefore ends with
--   store the JSON in ServerStorage.R15Export as StringValues of 90000 chars ("01","02","03"; a StringValue holds at most 200000) and return #js,
-- and each part is then read with  return game.ServerStorage.R15Export["01"].Value  (one call each; every >100 KB-token result is saved to a file by the tool).
-- Concatenate the three files (python, no printing) into cache/r15/raw.json, then destroy ServerStorage.R15Export.
-- Notes (see docs/R15.md): Studio has no HTTP, AssetService:CreateEditableMeshFromPartAsync does not exist in this build, but
-- AssetService:CreateEditableMeshAsync(Content.fromUri(meshPart.MeshId)) works for the 14 body MeshParts; the dynamic Head asset
-- is not loadable (no permission), so the classic head mesh rbxasset://avatar/heads/head.mesh is exported instead, fitted to the Head size.
-- Joints are AnimationConstraints (RigAttachments) in this Studio build; C0 = Attachment0.CFrame, C1 = Attachment1.CFrame, the same numbers a Motor6D had.
-- All numbers are integers: positions *10000, rotation matrix entries *100000, uv *10000, normals *1000 (divide on the python side).
local Players, AS, HttpService = game:GetService("Players"), game:GetService("AssetService"), game:GetService("HttpService")
local old = workspace:FindFirstChild("R15Probe"); if old then old:Destroy() end
local m = Players:CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
m.Name = "R15Probe"; m.Parent = workspace
local hrp = m.HumanoidRootPart
local function r(x, k) return math.floor(x * k + 0.5) end
local function cfa(c) -- CFrame -> {px,py,pz, r00,r01,r02,r10,r11,r12,r20,r21,r22}
  local q = { c:GetComponents() }
  return { r(q[1], 1e4), r(q[2], 1e4), r(q[3], 1e4), r(q[4], 1e5), r(q[5], 1e5), r(q[6], 1e5), r(q[7], 1e5), r(q[8], 1e5), r(q[9], 1e5), r(q[10], 1e5), r(q[11], 1e5), r(q[12], 1e5) }
end
local function meshOf(em, size, meshSize, fit)
  local vmap, V, UV, N, I = {}, {}, {}, {}, {}
  local sc = Vector3.new(size.X / meshSize.X, size.Y / meshSize.Y, size.Z / meshSize.Z)
  for _, f in ipairs(em:GetFaces()) do
    local fv, fn, fu = em:GetFaceVertices(f), em:GetFaceNormals(f), em:GetFaceUVs(f)
    for k = 1, 3 do
      local key = fv[k] .. "_" .. fn[k] .. "_" .. fu[k]
      local idx = vmap[key]
      if not idx then
        local p = em:GetPosition(fv[k]); p = fit and fit(p) or Vector3.new(p.X * sc.X, p.Y * sc.Y, p.Z * sc.Z)
        local n, uv = em:GetNormal(fn[k]), em:GetUV(fu[k])
        idx = #V // 3; vmap[key] = idx
        table.insert(V, r(p.X, 1e4)); table.insert(V, r(p.Y, 1e4)); table.insert(V, r(p.Z, 1e4))
        table.insert(UV, r(uv.X, 1e4)); table.insert(UV, r(uv.Y, 1e4))
        table.insert(N, r(n.X, 1e3)); table.insert(N, r(n.Y, 1e3)); table.insert(N, r(n.Z, 1e3))
      end
      table.insert(I, idx)
    end
  end
  return { p = V, uv = UV, n = N, i = I }
end
local out = { parts = {}, joints = {}, hipHeight = m.Humanoid.HipHeight, hrpSize = { hrp.Size.X, hrp.Size.Y, hrp.Size.Z } }
local inv = hrp.CFrame:Inverse()
for _, p in ipairs(m:GetChildren()) do
  if p:IsA("BasePart") then
    local e = { size = { r(p.Size.X, 1e4), r(p.Size.Y, 1e4), r(p.Size.Z, 1e4) }, cf = cfa(inv * p.CFrame), att = {} }
    for _, a in ipairs(p:GetChildren()) do if a:IsA("Attachment") then e.att[a.Name] = cfa(a.CFrame) end end
    if p:IsA("MeshPart") then
      e.meshSize = { p.MeshSize.X, p.MeshSize.Y, p.MeshSize.Z }
      local uri = p.Name == "Head" and "rbxasset://avatar/heads/head.mesh" or p.MeshId
      local ok, em = pcall(function() return AS:CreateEditableMeshAsync(Content.fromUri(uri)) end)
      if ok then
        local fit
        if p.Name == "Head" then -- classic head: fit its bounding box to the Head part size
          local mn, mx = Vector3.new(1e9, 1e9, 1e9), Vector3.new(-1e9, -1e9, -1e9)
          for _, v in ipairs(em:GetVertices()) do local q = em:GetPosition(v); mn = mn:Min(q); mx = mx:Max(q) end
          local c, s = (mn + mx) / 2, (mx - mn)
          e.headSrcBox = { mn.X, mn.Y, mn.Z, mx.X, mx.Y, mx.Z }
          fit = function(q) return Vector3.new((q.X - c.X) / s.X * p.Size.X, (q.Y - c.Y) / s.Y * p.Size.Y, (q.Z - c.Z) / s.Z * p.Size.Z) end
        end
        e.mesh = meshOf(em, p.Size, p.MeshSize, fit); e.meshSrc = uri
      else e.meshErr = tostring(em) end
    end
    out.parts[p.Name] = e
  end
end
for _, d in ipairs(m:GetDescendants()) do
  if d:IsA("AnimationConstraint") then
    out.joints[d.Name] = { d.Attachment0.Parent.Name, d.Attachment1.Parent.Name, cfa(d.Attachment0.CFrame), cfa(d.Attachment1.CFrame) }
  end
end
m:Destroy()
local js = HttpService:JSONEncode(out)
local SS = game:GetService("ServerStorage")
local f = SS:FindFirstChild("R15Export"); if f then f:Destroy() end
f = Instance.new("Folder"); f.Name = "R15Export"; f.Parent = SS
local n = 0
for i = 1, #js, 90000 do n += 1; local sv = Instance.new("StringValue"); sv.Name = string.format("%02d", n); sv.Value = js:sub(i, i + 89999); sv.Parent = f end
return #js .. " in " .. n
