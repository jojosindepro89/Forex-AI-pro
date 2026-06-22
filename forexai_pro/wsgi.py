import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'forexai_pro.settings')
application = get_wsgi_application()

# Run migrations automatically on Vercel startup
if os.environ.get('VERCEL'):
    from django.core.management import call_command
    try:
        call_command('migrate', interactive=False)
        print("Auto-migrations executed successfully on Vercel startup.")
    except Exception as e:
        print(f"Error running auto-migrations: {e}")
