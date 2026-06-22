from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import get_user_model

User = get_user_model()


@staff_member_required
def admin_dashboard(request):
    users = User.objects.all()
    stats = {
        'total_users': users.count(),
        'pro_users': users.filter(plan='pro').count(),
        'enterprise_users': users.filter(plan='enterprise').count(),
        'free_users': users.filter(plan='free').count(),
        'monthly_revenue': users.filter(plan='pro').count() * 49 + users.filter(plan='enterprise').count() * 199,
    }
    return render(request, 'admin_panel/dashboard.html', {'stats': stats, 'users': users[:10]})


@staff_member_required
def admin_users(request):
    users = User.objects.all().order_by('-date_joined')
    plan_filter = request.GET.get('plan', '')
    if plan_filter:
        users = users.filter(plan=plan_filter)
    return render(request, 'admin_panel/users.html', {'users': users})
