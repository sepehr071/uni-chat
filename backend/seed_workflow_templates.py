"""
Seed script for workflow templates.
Run: cd backend && python seed_workflow_templates.py
"""
from pymongo import MongoClient
from datetime import datetime

# MongoDB connection
client = MongoClient('mongodb://localhost:27017/')
db = client['unichat']
workflows_collection = db['workflows']

# Clear existing templates
workflows_collection.delete_many({'is_template': True})
print("Cleared existing workflow templates")

WORKFLOW_TEMPLATES = [
    # 1. Product Photography Studio
    {
        'name': 'Product Photography Studio',
        'description': 'Professional e-commerce product shot on clean white background with studio lighting',
        'nodes': [
            {
                'id': 'upload-product-1',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-studio-1',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 150},
                'data': {
                    'label': 'Studio Shot',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Professional product photography of the uploaded item, pure white seamless background, soft studio lighting from multiple angles, high-end commercial quality, sharp focus on product details, centered composition, 8K resolution, photorealistic, advertising quality',
                    'negativePrompt': 'harsh shadows, reflections, colored background, blur, watermark, text, logos, hands, people, cluttered',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-upload-studio',
                'source': 'upload-product-1',
                'target': 'gen-studio-1',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 2. Lifestyle Scene Generator
    {
        'name': 'Lifestyle Scene Generator',
        'description': 'Generate your product in 3 different real-world contexts: kitchen, office, and outdoor cafe',
        'nodes': [
            {
                'id': 'upload-product-2',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 200},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-kitchen-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 50},
                'data': {
                    'label': 'Kitchen Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product placed elegantly in a modern minimalist Scandinavian kitchen, natural morning light streaming through large window, white marble countertop, lifestyle photography, warm inviting tones, bokeh background, editorial style, magazine cover quality',
                    'negativePrompt': 'cluttered, dark, low quality, artificial lighting, stock photo feel, people, hands',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-office-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 200},
                'data': {
                    'label': 'Office Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product on a sleek modern office desk, professional workspace environment, MacBook laptop nearby, green plants, natural daylight from window, clean minimalist aesthetic, productivity lifestyle, premium quality photography',
                    'negativePrompt': 'cluttered desk, messy, dark, low quality, artificial, stock photo feel, people',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-cafe-2',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 350},
                'data': {
                    'label': 'Outdoor Cafe Scene',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in outdoor European cafe setting, rustic wooden table, beautifully blurred background with greenery and flowers, golden hour warm lighting, lifestyle shot, cozy atmosphere, Instagram worthy, travel aesthetic',
                    'negativePrompt': 'cluttered, dark, low quality, artificial, stock photo feel, indoor, people, hands',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-kitchen',
                'source': 'upload-product-2',
                'target': 'gen-kitchen-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-office',
                'source': 'upload-product-2',
                'target': 'gen-office-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-cafe',
                'source': 'upload-product-2',
                'target': 'gen-cafe-2',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 3. Social Media Content Pack
    {
        'name': 'Social Media Content Pack',
        'description': 'Generate product shots optimized for Instagram, Stories, and Website banners',
        'nodes': [
            {
                'id': 'upload-product-3',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 200},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-instagram-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 50},
                'data': {
                    'label': 'Instagram Square',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Eye-catching product shot for Instagram feed, vibrant saturated colors, clean soft gradient background in pastel tones, modern aesthetic, perfect square composition 1:1 ratio, trending style, high engagement visual, professional product photography',
                    'negativePrompt': 'dull colors, cluttered, text, watermark, blurry, low quality',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-story-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 200},
                'data': {
                    'label': 'Story/Reel Format',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Vertical product showcase for Instagram Stories and TikTok, dynamic interesting angle, bold vibrant colors, ample negative space at top and bottom for text overlay, social media ready, Gen-Z aesthetic, trendy, 9:16 vertical composition',
                    'negativePrompt': 'horizontal, cluttered, no space for text, boring angle, dull',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-banner-3',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 350},
                'data': {
                    'label': 'Website Banner',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Wide horizontal product banner for website hero section, product positioned on left third with clean negative space on right for headline text, professional marketing material, clean modern design, subtle gradient background, panoramic 3:1 ratio',
                    'negativePrompt': 'centered product, no space for text, cluttered, vertical, busy background',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-instagram',
                'source': 'upload-product-3',
                'target': 'gen-instagram-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-story',
                'source': 'upload-product-3',
                'target': 'gen-story-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-banner',
                'source': 'upload-product-3',
                'target': 'gen-banner-3',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 4. Seasonal Campaign Creator
    {
        'name': 'Seasonal Campaign Creator',
        'description': 'Generate holiday-themed and summer-themed product shots for seasonal marketing',
        'nodes': [
            {
                'id': 'upload-product-4',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 175},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-holiday-4',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 75},
                'data': {
                    'label': 'Holiday Theme',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in festive Christmas holiday setting, elegant gift presentation, warm cozy fireplace lighting, pine branches and holly decorations, gold and deep red accents, twinkling fairy lights bokeh, gift-worthy luxurious presentation, seasonal marketing, winter wonderland feel',
                    'negativePrompt': 'dark gloomy, cluttered, summer elements, beach, cheap looking, low quality',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-summer-4',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 275},
                'data': {
                    'label': 'Summer Vibes',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product in bright tropical summer setting, beach vacation vibes, palm leaves and monstera plants, bright sunshine with lens flare, fresh vibrant colors, turquoise and coral accents, vacation mood, poolside aesthetic, refreshing summer marketing campaign',
                    'negativePrompt': 'dark, gloomy, winter, snow, Christmas, cold colors, indoor, low quality',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-holiday',
                'source': 'upload-product-4',
                'target': 'gen-holiday-4',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-summer',
                'source': 'upload-product-4',
                'target': 'gen-summer-4',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 5. Brand Style Transfer
    {
        'name': 'Brand Style Transfer',
        'description': 'Apply a reference image style to your product for consistent brand aesthetic',
        'nodes': [
            {
                'id': 'upload-style-5',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 100},
                'data': {
                    'label': 'Upload Style Reference',
                    'imageUrl': None
                }
            },
            {
                'id': 'upload-product-5',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 275},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-styled-5',
                'type': 'imageGen',
                'position': {'x': 450, 'y': 175},
                'data': {
                    'label': 'Styled Product',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Product photo beautifully styled to match the aesthetic, color palette, lighting mood, and visual style of the reference image, maintaining perfect brand consistency, professional quality, cohesive visual identity, same photographic style and tone',
                    'negativePrompt': 'inconsistent style, clashing colors, generic look, different mood, mismatched aesthetic',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-style-ref',
                'source': 'upload-style-5',
                'target': 'gen-styled-5',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-product-styled',
                'source': 'upload-product-5',
                'target': 'gen-styled-5',
                'sourceHandle': 'output',
                'targetHandle': 'input-1'
            }
        ]
    },

    # 6. Before/After Enhancement
    {
        'name': 'Photo Enhancement',
        'description': 'Transform a basic product photo into professional commercial-quality imagery',
        'nodes': [
            {
                'id': 'upload-basic-6',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 150},
                'data': {
                    'label': 'Upload Basic Photo',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-enhanced-6',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 150},
                'data': {
                    'label': 'Enhanced Professional',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Transform into stunning professional product photography, perfect studio lighting setup, clean pure background, remove all imperfections and distractions, commercial advertising quality, high-end retouching, magazine-worthy, color corrected, sharp details, premium look',
                    'negativePrompt': 'original flaws, poor lighting, amateur look, blur, noise, artifacts, cluttered background, shadows',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-enhance',
                'source': 'upload-basic-6',
                'target': 'gen-enhanced-6',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 7. Advertisement Creator
    {
        'name': 'Advertisement Creator',
        'description': 'Generate A/B test ad variations: minimalist Apple-style vs bold energetic design',
        'nodes': [
            {
                'id': 'upload-product-7',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 175},
                'data': {
                    'label': 'Upload Product Image',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-minimal-7',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 75},
                'data': {
                    'label': 'Minimalist Ad',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Minimalist luxury advertisement, product elegantly floating on clean soft gray gradient background, subtle natural shadow beneath, premium Apple-style aesthetic, lots of white space, sophisticated understated elegance, high-end brand feel, clean typography ready',
                    'negativePrompt': 'busy, cluttered, colorful, loud, cheap looking, harsh shadows, text',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-bold-7',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 275},
                'data': {
                    'label': 'Bold Energetic Ad',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Bold dynamic advertisement design, product with vibrant colorful gradient background in electric blue and hot pink, energetic diagonal composition, motion blur accents, attention-grabbing eye-catching, modern Gen-Z marketing visual, sale promotion ready, high impact',
                    'negativePrompt': 'boring, static, muted colors, plain white, minimal, subtle, corporate boring',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-minimal',
                'source': 'upload-product-7',
                'target': 'gen-minimal-7',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-bold',
                'source': 'upload-product-7',
                'target': 'gen-bold-7',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    },

    # 8. Character Variation Generator
    {
        'name': 'Character Variation Generator',
        'description': 'Create different poses and expressions for your character or mascot design',
        'nodes': [
            {
                'id': 'upload-character-8',
                'type': 'imageUpload',
                'position': {'x': 50, 'y': 175},
                'data': {
                    'label': 'Upload Character/Mascot',
                    'imageUrl': None
                }
            },
            {
                'id': 'gen-action-8',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 75},
                'data': {
                    'label': 'Action Pose',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Same character in dynamic action pose, running or jumping with movement and energy, exactly consistent style colors and design as reference, character design sheet style, full body visible, clean white background, mascot illustration, maintaining all character features',
                    'negativePrompt': 'different character, wrong colors, inconsistent style, static boring pose, cropped',
                    'generatedImage': None
                }
            },
            {
                'id': 'gen-happy-8',
                'type': 'imageGen',
                'position': {'x': 400, 'y': 275},
                'data': {
                    'label': 'Happy Expression',
                    'model': 'bytedance-seed/seedream-4.5',
                    'prompt': 'Same character with joyful happy excited expression, big smile, sparkling eyes, celebratory pose with arms up, exactly consistent design style and colors as reference, expressive face, mascot style, clean white background, maintaining all character features',
                    'negativePrompt': 'different character, wrong colors, inconsistent style, sad, neutral, angry',
                    'generatedImage': None
                }
            }
        ],
        'edges': [
            {
                'id': 'e-action',
                'source': 'upload-character-8',
                'target': 'gen-action-8',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            },
            {
                'id': 'e-happy',
                'source': 'upload-character-8',
                'target': 'gen-happy-8',
                'sourceHandle': 'output',
                'targetHandle': 'input-0'
            }
        ]
    }
]

# Insert templates
for template in WORKFLOW_TEMPLATES:
    doc = {
        'user_id': None,  # System template - no owner
        'name': template['name'],
        'description': template['description'],
        'nodes': template['nodes'],
        'edges': template['edges'],
        'is_template': True,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    workflows_collection.insert_one(doc)
    print(f"Created template: {template['name']}")

print(f"\nSuccessfully created {len(WORKFLOW_TEMPLATES)} workflow templates!")
client.close()
