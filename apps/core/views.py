from django.shortcuts import render

def landing_view(request):
    if request.user.is_authenticated:
        from django.shortcuts import redirect
        return redirect('signals:dashboard')
    return render(request, 'core/landing.html')
