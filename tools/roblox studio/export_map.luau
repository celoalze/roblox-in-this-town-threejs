-- Dumps the geometry of a model (a whole map) as compact JSON: parts, shapes, colours, materials, mesh ids. UI, scripts, sounds are skipped.
-- Used by pipeline/tools/map_export.py (replaces __MODEL__ with the workspace child name). Returns one JSON string.
local H = game:GetService("HttpService")
local root = workspace:FindFirstChild("__MODEL__")
if not root then return H:JSONEncode({ error = "model not found" }) end
local r3 = function(x) return math.floor(x * 1000 + 0.5) / 1000 end
local OFF, CNT = __OFF__, __CNT__
local out, skipped, seen = {}, 0, 0
local function hex(c) return string.format("%02x%02x%02x", math.floor(c.R * 255 + .5), math.floor(c.G * 255 + .5), math.floor(c.B * 255 + .5)) end
for _, d in ipairs(root:GetDescendants()) do
  if d:IsA("BasePart") and not d:FindFirstAncestorWhichIsA("ScreenGui") and not d:FindFirstAncestorWhichIsA("SurfaceGui") then
    seen += 1
    if seen <= OFF or seen > OFF + CNT then -- other chunk
    elseif d.Transparency >= 0.95 then skipped += 1 else
      local kind = "B"
      local extra = nil
      if d:IsA("MeshPart") then kind = "M"; extra = { d.MeshId, d.TextureID }
      elseif d:IsA("WedgePart") then kind = "W"
      elseif d:IsA("CornerWedgePart") then kind = "CW"
      elseif d:IsA("UnionOperation") then kind = "U"
      elseif d:IsA("Part") then
        local sm = d:FindFirstChildOfClass("SpecialMesh") or d:FindFirstChildOfClass("CylinderMesh")
        if d.Shape == Enum.PartType.Ball then kind = "S"
        elseif d.Shape == Enum.PartType.Cylinder then kind = "C"
        elseif sm and sm:IsA("CylinderMesh") then kind = "CY"
        elseif sm and sm:IsA("SpecialMesh") then
          if sm.MeshType == Enum.MeshType.Sphere then kind = "S"
          elseif sm.MeshType == Enum.MeshType.Wedge then kind = "W"
          elseif sm.MeshType == Enum.MeshType.FileMesh then kind = "FM"; extra = { sm.MeshId, sm.TextureId, r3(sm.Scale.X), r3(sm.Scale.Y), r3(sm.Scale.Z) } end
        end
      end
      local cf = { d.CFrame:GetComponents() }
      for i = 1, #cf do cf[i] = r3(cf[i]) end
      local s = d.Size
      local dm = d:FindFirstChildWhichIsA("DataModelMesh")
      if dm and not (dm:IsA("SpecialMesh") and dm.MeshType == Enum.MeshType.FileMesh) then s = s * dm.Scale end
      out[#out + 1] = { kind, cf, { r3(s.X), r3(s.Y), r3(s.Z) }, hex(d.Color), d.Material.Name, r3(d.Transparency), extra }
    end
  end
end
return H:JSONEncode({ n = #out, skipped = skipped, seen = seen, parts = out })
