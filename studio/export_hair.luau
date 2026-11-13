-- Builds Workspace.ExportHair: each hair accessory fitted on a classic R6 head, then only the hair Handle is kept,
-- placed so that the HEAD CENTRE is at (i*4, 0, 0) and the face looks toward -Z (Roblox front).
-- One Export Selection of ExportHair -> assets/roblox/hair.obj (groups named hair_<assetId>).
-- __IDS__ = JSON array of hair asset ids.
local HttpService, Players = game:GetService("HttpService"), game:GetService("Players")
local IDS = HttpService:JSONDecode([==[__IDS__]==])
local old = workspace:FindFirstChild("ExportHair"); if old then old:Destroy() end
local out = Instance.new("Model"); out.Name = "ExportHair"; out.Parent = workspace
local done = {}
for i, id in ipairs(IDS) do
  local d = Instance.new("HumanoidDescription"); d.HairAccessory = tostring(id)
  local ok, rig = pcall(function() return Players:CreateHumanoidModelFromDescription(d, Enum.HumanoidRigType.R6) end)
  if ok and rig then
    rig.Parent = workspace
    local head = rig.Head
    local base = head.CFrame
    for _, acc in ipairs(rig:GetChildren()) do
      if acc:IsA("Accessory") then
        local h = acc:FindFirstChild("Handle")
        if h then
          local rel = base:ToObjectSpace(h.CFrame)           -- handle relative to head
          h.Parent = out; h.Anchored = true; h.Name = "hair_" .. id
          for _, w in ipairs(h:GetChildren()) do if w:IsA("Weld") or w:IsA("WeldConstraint") or w:IsA("Attachment") then w:Destroy() end end
          h.CFrame = CFrame.new((i - 1) * 4, 1000, 0) * rel    -- head centre of slot i
          table.insert(done, id)
        end
      end
    end
    rig:Destroy()
  end
end
workspace.CurrentCamera.CFrame = CFrame.lookAt(Vector3.new(#IDS * 2, 1001, -16), Vector3.new(#IDS * 2, 1000, 0))
return "ExportHair: " .. #done .. " handles (" .. table.concat(done, ",") .. ")"
