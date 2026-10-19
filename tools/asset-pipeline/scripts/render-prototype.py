"""Original Phase 01 models. Execute through Blender's local MCP add-on.

Creates a separate scene; leaves the user's existing scene and objects intact.
Raw 32px RGBA renders are code-reworked by pixelize before use in the game.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

root = Path(bpy.path.abspath('//')) if bpy.data.filepath else Path.cwd()
# The caller prepends CQ_ROOT so saving never depends on Blender's cwd.
root = Path(CQ_ROOT)
out = root / 'art' / 'blender' / 'prototype'
out.mkdir(parents=True, exist_ok=True)
original_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('CQ Phase 01 style study')
bpy.context.window.scene = scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.cycles.seed = 0
scene.cycles.use_animated_seed = False
scene.render.resolution_x = 32
scene.render.resolution_y = 32
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filter_size = 0.01
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('CQ ambient')
scene.world.color = (0.7, 0.7, 0.7)

def material(name, color):
    mat = bpy.data.materials.new('CQ ' + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*color, 1)
    mat.node_tree.links.new(emit.outputs[0], output.inputs[0])
    return mat

mint = material('mint', (0.18, 0.75, 0.58))
glow = material('glow', (0.55, 1.0, 0.8))
shade = material('shade', (0.06, 0.34, 0.34))
purple = material('purple', (0.37, 0.24, 0.63))
light_purple = material('light purple', (0.58, 0.4, 0.79))
dark = material('outline eyes', (0.025, 0.03, 0.07))
wood = material('sign', (0.66, 0.42, 0.22))
cream = material('letters', (1.0, 0.88, 0.65))

def ball(name, loc, scale, mat, parent):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = 'CQ ' + name
    obj.scale = scale
    obj.data.materials.append(mat)
    # Explicit two hard color bands on polygon faces; no smooth normals / AA.
    obj.data.materials.append(shade if mat == mint else mat)
    for face in obj.data.polygons:
        face.material_index = 1 if face.normal.z < -0.2 else 0
    obj.parent = parent
    return obj

def cube(name, loc, scale, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = 'CQ ' + name
    obj.scale = scale
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj

camera_data = bpy.data.cameras.new('CQ orthographic')
camera = bpy.data.objects.new('CQ orthographic', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -6, 3.8)
camera.rotation_euler = (Vector((0, 0, 0.85)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.05
scene.camera = camera

groups = {}
for name in ('gitling', 'gremlin'):
    parent = bpy.data.objects.new('CQ ' + name, None)
    scene.collection.objects.link(parent)
    groups[name] = parent

p = groups['gitling']
ball('gitling body', (0, 0, 0.95), (0.62, 0.42, 0.62), mint, p)
ball('gitling crest', (0, 0.02, 1.65), (0.22, 0.18, 0.32), glow, p)
for side in (-1, 1):
    ball('gitling wing', (side * 0.68, 0.04, 1.05), (0.3, 0.14, 0.25), glow, p)
    ball('gitling eye', (side * 0.22, -0.37, 1.13), (0.085, 0.065, 0.12), dark, p)
    ball('gitling spark', (side * 0.85, 0, 1.65), (0.075, 0.075, 0.075), glow, p)

p = groups['gremlin']
ball('gremlin torso', (0, 0, 0.75), (0.43, 0.32, 0.53), purple, p)
ball('gremlin head', (0, -0.02, 1.4), (0.5, 0.37, 0.42), light_purple, p)
for side in (-1, 1):
    ball('gremlin ear', (side * 0.5, 0, 1.58), (0.35, 0.12, 0.18), purple, p)
    ball('gremlin foot', (side * 0.23, -0.12, 0.24), (0.21, 0.3, 0.17), purple, p)
    ball('gremlin eye', (side * 0.2, -0.34, 1.5), (0.08, 0.065, 0.1), dark, p)
cube('sign post', (0.48, -0.36, 0.78), (0.08, 0.08, 0.8), wood, p)
cube('TODO sign', (0.48, -0.4, 1.03), (1.05, 0.1, 0.48), wood, p)
bpy.ops.object.text_add(location=(0.02, -0.46, 0.94), rotation=(math.pi/2, 0, 0))
text = bpy.context.object
text.name = 'CQ TODO letters'
text.data.body = 'TODO'
text.data.size = 0.24
text.data.extrude = 0
text.data.materials.append(cream)
text.parent = p

frames = []
for name, parent in groups.items():
    for other_name, other in groups.items():
        for obj in other.children:
            obj.hide_render = other_name != name
    for direction, angle in enumerate((0, math.pi/2, math.pi, 3*math.pi/2)):
        for frame in range(4):
            parent.rotation_euler.z = angle
            parent.location.z = (0, 0.07, 0, -0.04)[frame]
            parent.scale = (1, 1, (1, 1.02, 1, 0.98)[frame])
            filename = f'{name}-{direction}-{frame}.png'
            scene.render.filepath = str(out / filename)
            bpy.ops.render.render(write_still=True, scene=scene.name)
            frames.append(filename)
    parent.location.z = 0
    parent.scale = (1, 1, 1)
    parent.rotation_euler.z = 0
    # Write only this study scene, excluding the user's existing scene/data.
    # Library writing also avoids generating unlicensed .blend1 backup files.
    bpy.data.libraries.write(str(out / f'{name}.blend'), {scene}, fake_user=True, compress=True)

bpy.context.window.scene = original_scene
result = {'frames': frames, 'source_directory': str(out), 'scene': scene.name}
