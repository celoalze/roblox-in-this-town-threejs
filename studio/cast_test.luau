local Players, AS, MS = game:GetService("Players"), game:GetService("AssetService"), game:GetService("MarketplaceService")
local old = workspace:FindFirstChild("Sandbox"); if old then old:Destroy() end
local root = Instance.new("Folder"); root.Name = "Sandbox"; root.Parent = workspace
local out = {}
local function headFromBundle(bid)
  local d = AS:GetBundleDetailsAsync(bid)
  for _, it in ipairs(d.Items) do if it.Type == "Asset" then local info = MS:GetProductInfo(it.Id); if info.AssetTypeId == 79 then return it.Id end end end
end
local CAST = {
  {name = "milo", head = 945, hair = "7259123616", shirt = 398633584, pants = 382538503, skin = Color3.fromRGB(234, 184, 146)},
  {name = "zoe", head = 946, hair = "6501746646", shirt = 398634295, pants = 398634487, skin = Color3.fromRGB(255, 214, 180)},
  {name = "jay", head = 949, hair = "376524487", shirt = 382538059, pants = 144076760, skin = Color3.fromRGB(160, 110, 80)},
}
local x = -2445
for _, c in ipairs(CAST) do
  local d = Instance.new("HumanoidDescription")
  local hid = headFromBundle(c.head); d.Head = hid or 0
  d.HairAccessory = c.hair; d.Shirt = c.shirt; d.Pants = c.pants
  for _, k in ipairs({"HeadColor","TorsoColor","LeftArmColor","RightArmColor","LeftLegColor","RightLegColor"}) do d[k] = c.skin end
  local m = Players:CreateHumanoidModelFromDescription(d, Enum.HumanoidRigType.R15)
  m.Name = c.name; m.Parent = root; m.Humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
  m:PivotTo(CFrame.lookAt(Vector3.new(x, 537.2, -3335), Vector3.new(x, 537.2, -3320))); x += 4
  local fc = m.Head:FindFirstChildWhichIsA("FaceControls", true)
  table.insert(out, c.name.." head="..tostring(hid).." faceControls="..tostring(fc ~= nil).." parts="..#m:GetChildren())
end
workspace.CurrentCamera.CFrame = CFrame.lookAt(Vector3.new(-2441, 539.5, -3324), Vector3.new(-2441, 538.6, -3335))
return table.concat(out, "\n")
